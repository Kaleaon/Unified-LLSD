use unified_llsd::*;
use std::time::Duration;

#[test]
fn test_rust_packet_flags_alignment() {
    assert_eq!(PacketFlags::ZERO_CODED, 0x80);
    assert_eq!(PacketFlags::RELIABLE, 0x40);
    assert_eq!(PacketFlags::RESENT, 0x20);
    assert_eq!(PacketFlags::ACKS, 0x10);
}

#[test]
fn test_rust_packet_codec_decode_and_zero_coding() {
    let raw = vec![0x80, 0x00, 0x00, 0x00, 0x01, 0x00, 0x42, 0x00, 0x03, 0x05, 0x06];
    let (header, header_len) = PacketCodec::decode_header(&raw).unwrap();

    assert!(header.flags.zero_coded);
    assert!(!header.flags.reliable);
    assert_eq!(header.sequence_number, 1);
    assert_eq!(header.message_id, 0x42);
    assert_eq!(header_len, 7);

    let uncompressed = PacketCodec::zero_decode(&raw, header_len);
    let expected = vec![0x80, 0x00, 0x00, 0x00, 0x01, 0x00, 0x42, 0x00, 0x00, 0x00, 0x05, 0x06];
    assert_eq!(uncompressed, expected);

    let body = vec![0x01, 0x00, 0x00, 0x00, 0x02];
    let compressed = PacketCodec::zero_encode(&body);
    assert_eq!(compressed, vec![0x01, 0x00, 0x03, 0x02]);
}

#[test]
fn test_rust_circuit_manager_sequence_and_acks() {
    let cm = CircuitManager::new(12345);
    assert_eq!(cm.get_next_sequence_number(), 1);
    assert_eq!(cm.get_next_sequence_number(), 2);

    assert!(cm.process_inbound_packet(100, true));
    assert!(!cm.process_inbound_packet(100, true)); // Duplicate

    let pending = cm.get_pending_acks(10);
    assert_eq!(pending, vec![100, 100]);

    cm.track_outgoing_packet(5, vec![1, 2, 3]);
    let resends = cm.get_packets_to_resend(Duration::from_secs(10), 3);
    assert!(resends.is_empty());

    cm.process_acks(&[5]);
}
