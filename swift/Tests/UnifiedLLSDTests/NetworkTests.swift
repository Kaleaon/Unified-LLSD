import XCTest
@testable import UnifiedLLSD

final class NetworkTests: XCTestCase {
    func testPacketFlagsAlignment() {
        XCTAssertEqual(PacketFlags.zeroCoded.rawValue, 0x80)
        XCTAssertEqual(PacketFlags.reliable.rawValue, 0x40)
        XCTAssertEqual(PacketFlags.resent.rawValue, 0x20)
        XCTAssertEqual(PacketFlags.acks.rawValue, 0x10)
    }

    func testPacketCodecDecodeAndZeroCode() throws {
        var rawData = Data([0x80, 0x00, 0x00, 0x00, 0x01, 0x00, 0x42, 0x00, 0x03, 0x05, 0x06])
        let (header, headerLen) = try PacketCodec.decodeHeader(from: rawData)

        XCTAssertTrue(header.isZeroCoded)
        XCTAssertFalse(header.isReliable)
        XCTAssertEqual(header.sequenceNumber, 1)
        XCTAssertEqual(header.messageId, 0x42)
        XCTAssertEqual(headerLen, 7)

        let uncompressed = PacketCodec.zeroDecode(data: rawData, headerLength: headerLen)
        XCTAssertEqual(uncompressed, Data([0x80, 0x00, 0x00, 0x00, 0x01, 0x00, 0x42, 0x00, 0x00, 0x00, 0x05, 0x06]))

        let body = Data([0x01, 0x00, 0x00, 0x00, 0x02])
        let compressed = PacketCodec.zeroEncode(body: body)
        XCTAssertEqual(compressed, Data([0x01, 0x00, 0x03, 0x02]))
    }

    func testCircuitManagerSequenceAndAcks() {
        let cm = CircuitManager(circuitCode: 12345)
        XCTAssertEqual(cm.getNextSequenceNumber(), 1)
        XCTAssertEqual(cm.getNextSequenceNumber(), 2)

        XCTAssertTrue(cm.processInboundPacket(sequenceNumber: 100, reliable: true))
        XCTAssertFalse(cm.processInboundPacket(sequenceNumber: 100, reliable: true)) // Duplicate

        let pending = cm.getPendingAcks()
        XCTAssertEqual(pending, [100, 100])

        cm.trackOutgoingPacket(sequenceNumber: 5, packetData: Data([1, 2, 3]))
        let resendsBeforeTimeout = cm.getPacketsToResend(timeout: 10.0)
        XCTAssertTrue(resendsBeforeTimeout.isEmpty)

        cm.processAcks([5])
    }
}
