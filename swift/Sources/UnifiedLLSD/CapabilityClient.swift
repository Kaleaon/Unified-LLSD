import Foundation

public struct EventQueueEvent {
    public var eventName: String
    public var body: LLSD

    public init(eventName: String = "", body: LLSD = .undefined) {
        self.eventName = eventName
        self.body = body
    }
}

public class CapabilityClient {
    private let urlSession: URLSession

    public init(urlSession: URLSession = .shared) {
        self.urlSession = urlSession
    }

    public func postLLSD(capabilityUrl: String, payload: LLSD) async throws -> LLSD {
        guard let url = URL(string: capabilityUrl) else {
            throw NSError(domain: "CapabilityClient", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
        }

        let xmlPayload = LLSDSerialize.toXML(payload, withDeclaration: true)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/llsd+xml", forHTTPHeaderField: "Content-Type")
        request.httpBody = xmlPayload.data(using: .utf8)

        let (data, response) = try await urlSession.data(for: request)
        if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode < 200 || httpResponse.statusCode >= 300 {
            throw NSError(domain: "CapabilityClient", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "HTTP error \(httpResponse.statusCode)"])
        }

        return LLSDSerialize.parse(data)
    }

    public func pollEventQueue(eventQueueUrl: String, ack: Int = 0) async throws -> [EventQueueEvent] {
        let reqMap: LLSD = .map([
            "ack": .integer(Int64(ack)),
            "done": .boolean(false)
        ])

        let responseLlsd = try await postLLSD(capabilityUrl: eventQueueUrl, payload: reqMap)
        var events = [EventQueueEvent]()

        if case .map(let dict) = responseLlsd, let eventsLlsd = dict["events"], case .array(let evtList) = eventsLlsd {
            for evtItem in evtList {
                if case .map(let evtDict) = evtItem {
                    let eventName = evtDict["message"]?.asString() ?? ""
                    let body = evtDict["body"] ?? .undefined
                    events.append(EventQueueEvent(eventName: eventName, body: body))
                }
            }
        }

        return events
    }
}
