import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'llsd.dart';
import 'llsd_serialize.dart';

class EventQueueEvent {
  final String eventName;
  final LLSD body;

  EventQueueEvent({this.eventName = '', LLSD? body})
      : body = body ?? LLSD.undefined;
}

class CapabilityClient {
  final HttpClient _httpClient;

  CapabilityClient({HttpClient? httpClient})
      : _httpClient = httpClient ?? HttpClient();

  Future<LLSD> postLLSD(String capabilityUrl, LLSD payload) async {
    final uri = Uri.parse(capabilityUrl);
    final request = await _httpClient.postUrl(uri);
    request.headers.contentType = ContentType('application', 'llsd+xml');

    final xmlPayload = LLSDSerialize.toXML(payload, withDeclaration: true);
    request.write(xmlPayload);

    final response = await request.close();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw HttpException('HTTP error ${response.statusCode}');
    }

    final responseBytes = await response.fold<List<int>>([], (p, e) => p..addAll(e));
    return LLSDSerialize.fromXML(utf8.decode(responseBytes));
  }

  Future<List<EventQueueEvent>> pollEventQueue(String eventQueueUrl, {int ack = 0}) async {
    final reqMap = LLSD.mapVal({
      'ack': LLSD.intVal(ack),
      'done': LLSD.boolVal(false),
    });

    final responseLlsd = await postLLSD(eventQueueUrl, reqMap);
    final events = <EventQueueEvent>[];

    if (responseLlsd.type == LLSDType.map) {
      final eventsArray = responseLlsd['events'];
      if (eventsArray.type == LLSDType.array) {
        for (var i = 0; i < eventsArray.length; i++) {
          final evtItem = eventsArray[i];
          if (evtItem.type == LLSDType.map) {
            events.add(
              EventQueueEvent(
                eventName: evtItem['message'].asString(),
                body: evtItem['body'],
              ),
            );
          }
        }
      }
    }

    return events;
  }
}
