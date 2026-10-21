#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct PacketFlags {
    pub zero_coded: bool,
    pub reliable: bool,
    pub resent: bool,
    pub acks: bool,
}

impl PacketFlags {
    pub const ZERO_CODED: u8 = 0x80;
    pub const RELIABLE: u8 = 0x40;
    pub const RESENT: u8 = 0x20;
    pub const ACKS: u8 = 0x10;

    pub fn from_u8(val: u8) -> Self {
        Self {
            zero_coded: (val & Self::ZERO_CODED) != 0,
            reliable: (val & Self::RELIABLE) != 0,
            resent: (val & Self::RESENT) != 0,
            acks: (val & Self::ACKS) != 0,
        }
    }

    pub fn to_u8(&self) -> u8 {
        let mut val = 0u8;
        if self.zero_coded { val |= Self::ZERO_CODED; }
        if self.reliable { val |= Self::RELIABLE; }
        if self.resent { val |= Self::RESENT; }
        if self.acks { val |= Self::ACKS; }
        val
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PacketHeader {
    pub flags: PacketFlags,
    pub sequence_number: u32,
    pub extra_bytes: u8,
    pub message_id: u32,
    pub acks: Vec<u32>,
}

pub struct PacketCodec;

impl PacketCodec {
    pub fn decode_header(buffer: &[u8]) -> Result<(PacketHeader, usize), &'static str> {
        if buffer.len() < 6 {
            return Err("Buffer too small for packet header.");
        }

        let flags = PacketFlags::from_u8(buffer[0]);
        let sequence_number = u32::from_be_bytes(buffer[1..5].try_into().unwrap());
        let extra_bytes = buffer[5];

        let mut header = PacketHeader {
            flags,
            sequence_number,
            extra_bytes,
            message_id: 0,
            acks: Vec::new(),
        };

        let mut offset = 6 + extra_bytes as usize;

        if offset < buffer.len() {
            let first = buffer[offset];
            if first != 0xFF {
                header.message_id = first as u32;
                offset += 1;
            } else if offset + 1 < buffer.len() && buffer[offset + 1] != 0xFF {
                let second = buffer[offset + 1];
                header.message_id = ((0xFFu32) << 8) | (second as u32);
                offset += 2;
            } else if offset + 3 < buffer.len() {
                header.message_id = u32::from_be_bytes(buffer[offset..offset + 4].try_into().unwrap());
                offset += 4;
            }
        }

        if header.flags.acks && !buffer.is_empty() {
            let ack_count = buffer[buffer.len() - 1] as usize;
            let ack_start = buffer.len().saturating_sub(1 + ack_count * 4);
            if ack_start >= offset && buffer.len() >= ack_start + ack_count * 4 + 1 {
                for i in 0..ack_count {
                    let pos = ack_start + i * 4;
                    let ack_seq = u32::from_be_bytes(buffer[pos..pos + 4].try_into().unwrap());
                    header.acks.push(ack_seq);
                }
            }
        }

        Ok((header, offset))
    }

    pub fn zero_decode(src: &[u8], header_len: usize) -> Vec<u8> {
        if src.len() <= header_len {
            return src.to_vec();
        }

        let mut dst = Vec::with_capacity(src.len() * 2);
        dst.extend_from_slice(&src[..header_len]);

        let mut pos = header_len;
        while pos < src.len() {
            let b = src[pos];
            pos += 1;
            if b == 0x00 {
                if pos < src.len() {
                    let zero_count = src[pos] as usize;
                    pos += 1;
                    dst.resize(dst.len() + zero_count, 0x00);
                } else {
                    dst.push(0x00);
                }
            } else {
                dst.push(b);
            }
        }

        dst
    }

    pub fn zero_encode(body: &[u8]) -> Vec<u8> {
        let mut dst = Vec::with_capacity(body.len());
        let mut i = 0;
        while i < body.len() {
            if body[i] == 0x00 {
                let zero_start = i;
                while i < body.len() && body[i] == 0x00 && (i - zero_start) < 255 {
                    i += 1;
                }
                let count = (i - zero_start) as u8;
                dst.push(0x00);
                dst.push(count);
            } else {
                dst.push(body[i]);
                i += 1;
            }
        }
        dst
    }
}
