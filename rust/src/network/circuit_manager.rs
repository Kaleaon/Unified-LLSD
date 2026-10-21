use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct UnackedPacket {
    pub sequence_number: u32,
    pub packet_data: Vec<u8>,
    pub sent_time: Instant,
    pub retries: usize,
}

pub struct CircuitManager {
    circuit_code: u32,
    state: Mutex<CircuitState>,
}

struct CircuitState {
    next_out_sequence_number: u32,
    received_sequences: HashSet<u32>,
    pending_acks: VecDeque<u32>,
    unacked_packets: HashMap<u32, UnackedPacket>,
    _is_connected: bool,
    _last_packet_received_time: Instant,
}

impl CircuitManager {
    pub fn new(circuit_code: u32) -> Self {
        Self {
            circuit_code,
            state: Mutex::new(CircuitState {
                next_out_sequence_number: 1,
                received_sequences: HashSet::new(),
                pending_acks: VecDeque::new(),
                unacked_packets: HashMap::new(),
                _is_connected: true,
                _last_packet_received_time: Instant::now(),
            }),
        }
    }

    pub fn circuit_code(&self) -> u32 {
        self.circuit_code
    }

    pub fn get_next_sequence_number(&self) -> u32 {
        let mut state = self.state.lock().unwrap();
        let seq = state.next_out_sequence_number;
        state.next_out_sequence_number += 1;
        seq
    }

    pub fn process_inbound_packet(&self, sequence_number: u32, reliable: bool) -> bool {
        let mut state = self.state.lock().unwrap();
        state._last_packet_received_time = Instant::now();

        if state.received_sequences.contains(&sequence_number) {
            if reliable {
                state.pending_acks.push_back(sequence_number);
            }
            return false;
        }

        state.received_sequences.insert(sequence_number);

        if state.received_sequences.len() > 2048 {
            if let Some(&min_seq) = state.received_sequences.iter().min() {
                state.received_sequences.remove(&min_seq);
            }
        }

        if reliable {
            state.pending_acks.push_back(sequence_number);
        }

        true
    }

    pub fn track_outgoing_packet(&self, sequence_number: u32, packet_data: Vec<u8>) {
        let mut state = self.state.lock().unwrap();
        state.unacked_packets.insert(
            sequence_number,
            UnackedPacket {
                sequence_number,
                packet_data,
                sent_time: Instant::now(),
                retries: 0,
            },
        );
    }

    pub fn process_acks(&self, acks: &[u32]) {
        let mut state = self.state.lock().unwrap();
        for ack in acks {
            state.unacked_packets.remove(ack);
        }
    }

    pub fn get_pending_acks(&self, max_count: usize) -> Vec<u32> {
        let mut state = self.state.lock().unwrap();
        let mut result = Vec::new();
        while !state.pending_acks.is_empty() && result.len() < max_count {
            if let Some(ack) = state.pending_acks.pop_front() {
                result.push(ack);
            }
        }
        result
    }

    pub fn get_packets_to_resend(&self, timeout: Duration, max_retries: usize) -> Vec<UnackedPacket> {
        let mut state = self.state.lock().unwrap();
        let now = Instant::now();
        let mut resend_list = Vec::new();
        let mut timed_out_keys = Vec::new();

        for (&seq, packet) in state.unacked_packets.iter_mut() {
            if now.duration_since(packet.sent_time) > timeout {
                if packet.retries >= max_retries {
                    timed_out_keys.push(seq);
                } else {
                    packet.retries += 1;
                    packet.sent_time = now;
                    resend_list.push(packet.clone());
                }
            }
        }

        for key in timed_out_keys {
            state.unacked_packets.remove(&key);
        }

        resend_list
    }
}
