import 'dart:typed_data';

class UnackedPacket {
  final int sequenceNumber;
  final Uint8List packetData;
  DateTime sentTime;
  int retries;

  UnackedPacket({
    required this.sequenceNumber,
    required this.packetData,
    DateTime? sentTime,
    this.retries = 0,
  }) : sentTime = sentTime ?? DateTime.now();
}

class CircuitManager {
  final int circuitCode;
  int _nextOutSequenceNumber = 1;
  final Set<int> _receivedSequences = {};
  final List<int> _pendingAcks = [];
  final Map<int, UnackedPacket> _unackedPackets = {};

  bool isConnected = true;
  DateTime lastPacketReceivedTime = DateTime.now();

  CircuitManager(this.circuitCode);

  int getNextSequenceNumber() {
    return _nextOutSequenceNumber++;
  }

  bool processInboundPacket(int sequenceNumber, bool reliable) {
    lastPacketReceivedTime = DateTime.now();

    if (_receivedSequences.contains(sequenceNumber)) {
      if (reliable) {
        _pendingAcks.add(sequenceNumber);
      }
      return false;
    }

    _receivedSequences.add(sequenceNumber);

    if (_receivedSequences.length > 2048) {
      final minSeq = _receivedSequences.reduce((a, b) => a < b ? a : b);
      _receivedSequences.remove(minSeq);
    }

    if (reliable) {
      _pendingAcks.add(sequenceNumber);
    }

    return true;
  }

  void trackOutgoingPacket(int sequenceNumber, Uint8List packetData) {
    _unackedPackets[sequenceNumber] = UnackedPacket(
      sequenceNumber: sequenceNumber,
      packetData: packetData,
      sentTime: DateTime.now(),
      retries: 0,
    );
  }

  void processAcks(Iterable<int> acks) {
    for (final ack in acks) {
      _unackedPackets.remove(ack);
    }
  }

  List<int> getPendingAcks({int maxCount = 255}) {
    final count = _pendingAcks.length < maxCount ? _pendingAcks.length : maxCount;
    final result = _pendingAcks.sublist(0, count);
    _pendingAcks.removeRange(0, count);
    return result;
  }

  List<UnackedPacket> getPacketsToResend(Duration timeout, {int maxRetries = 3}) {
    final now = DateTime.now();
    final resendList = <UnackedPacket>[];
    final timedOutKeys = <int>[];

    for (final entry in _unackedPackets.entries) {
      final packet = entry.value;
      if (now.difference(packet.sentTime) > timeout) {
        if (packet.retries >= maxRetries) {
          timedOutKeys.add(entry.key);
        } else {
          packet.retries++;
          packet.sentTime = now;
          resendList.add(packet);
        }
      }
    }

    for (final key in timedOutKeys) {
      _unackedPackets.remove(key);
    }

    return resendList;
  }
}
