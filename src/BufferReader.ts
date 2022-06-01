export class BufferReader {
    position: number = 0;

    constructor(public buffer: Tvb) {}

    read(length: number): TvbRange {
        const value = this.buffer(this.position, length);
        this.position += length;
        return value;
    }

    packed(): [TvbRange, number] {
        const start = this.position;

        let output = 0;
        let readMore = true;
        let shift = 0;

        while (readMore)
        {
            let b = this.read(1).int();
            if (b >= 0x80)
            {
                readMore = true;
                b ^= 0x80;
            }
            else
            {
                readMore = false;
            }

            output |= b << shift;
            shift += 7;
        }

        return [this.buffer(start, this.position - start), output];
    }

    upacked() {
        const [buffer, value] = this.packed();
        return [buffer, value >>> 0];
    }
}