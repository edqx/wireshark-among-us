import { BufferReader } from "./BufferReader";

const protocol = Proto("among-us", "Among Us Protocol");

enum PacketType {
    Unreliable = 0,
    Reliable = 1,
    Hello = 8,
    Ping = 12,
    Disconnect = 9,
    Acknowledgement = 10,
    Fragment = 11,
}

enum QuickChatModes {
    FreeChatOrQuickChat = 1,
    QuickChatOnly = 2,
}

enum Language {
    English,
    SpanishLA,
    Brazilian,
    Portuguese,
    Korean,
    Russian,
    Dutch,
    Filipino,
    French,
    German,
    Italian,
    Japanese,
    SpanishEU,
}

enum MessageTag {
    HostGame = 0,
    JoinGame = 1,
    StartGame = 2,
    RemoveGame = 3,
    RemovePlayer = 4,
    GameData = 5,
    GameDataTo = 6,
    JoinedGame = 7,
    EndGame = 8,
    AlterGame = 10,
    KickPlayer = 11,
    WaitForHost = 12,
    Redirect = 13,
    ReselectServer = 14,
    GetGameListV2 = 16,
    ReportPlayer = 17,
    QuickMatch = 18,
    QuickMatchHost = 19,
    SetGameSession = 20,
    SetActivePodType = 21,
    QueryPlatformIds = 22,
    QueryLobbyInfo = 23,
}

function numberToString(o: { [s: string | number]: string | number }): { [key: number]: string } {
    return Object.fromEntries(Object.entries(o).filter(([key, value]) => typeof key == "number" && typeof value == "string")) as { [key: number]: string }
}

const packetTypeField = ProtoField.int8("among-us.packet-type", "Type", base.DEC, numberToString(PacketType))

function parseGameVersion(value: number) {
    const year = Math.floor(value / 25000);
    value %= 25000;
    const month = Math.floor(value / 1800);
    value %= 1800;
    const day = Math.floor(value / 50);
    const revision = value % 50;

    return { year, month, day, revision };
}

protocol.fields = [packetTypeField];
protocol.dissector = function (buffer, info, tree) {
    info.cols.protocol = protocol.name;

    const reader = new BufferReader(buffer);

    const subtree = tree.add(protocol, buffer(), "Among Us");

    const typeBuffer = reader.read(1);
    subtree.add_le(packetTypeField, typeBuffer);
    const type = typeBuffer.uint() as PacketType;

    switch (type) {
        case PacketType.Reliable:
        case PacketType.Ping:
        case PacketType.Hello:
        case PacketType.Acknowledgement:
            const nonce = reader.read(2);
            subtree.add(nonce, "Nonce: " + nonce.uint());
            break;
    }

    switch (type) {
        case PacketType.Acknowledgement:
            if (reader.position < buffer.len()) {
                const recentPacketsBuffer = reader.read(1);
                let recentPackets = recentPacketsBuffer.uint();
                let array: number[] = [];

                for (let i = 0; i < 8; i++) {
                    if ((recentPackets & (1 << i)) === 0) {
                        array.push(i);
                    }
                }

                subtree.add(recentPacketsBuffer, `Recent packets: [${array.join(", ")}]`);
            }
            break;

        case PacketType.Hello: {
            reader.read(1);

            const clientVersionBuffer = reader.read(4);
            const clientVersion = parseGameVersion(clientVersionBuffer.le_int());
            subtree.add(clientVersionBuffer, `Client version: ${clientVersion.year}.${clientVersion.month}.${clientVersion.day}.${clientVersion.revision} (${clientVersionBuffer.le_int()})`);

            const [_, nameLength] = reader.packed();
            const nameBuffer = reader.read(nameLength);
            subtree.add(nameBuffer, "Name: " + nameBuffer.string());

            const lastNonceReceived = reader.read(4);

            const language = reader.read(4);
            subtree.add(language, "Language: " + Language[language.le_uint()]);

            const chatMode = reader.read(1);
            subtree.add(chatMode, "Chat mode: " + QuickChatModes[chatMode.le_uint()]);

            break;
        }

        case PacketType.Reliable:
        case PacketType.Unreliable: {
            while (reader.position < buffer.len()) {
                const startPosition = reader.position;

                const messageLength = reader.read(2).le_uint();
                const messageTag = reader.read(1).int() as MessageTag;
                reader.read(messageLength);

                subtree.add(buffer(startPosition, reader.position - startPosition), MessageTag[messageTag])
            }

            break;
        }
    }
};

const udpTable = DissectorTable.get("udp.port")!;
udpTable.add(22023, protocol);
