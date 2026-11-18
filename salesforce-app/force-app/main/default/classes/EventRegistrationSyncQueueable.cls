public with sharing class EventRegistrationSyncQueueable implements Queueable, Database.AllowsCallouts {
    
    private Set<Id> registrationIds;
    
    public class TicketPayload {
        public String registrationId;
        public String registrationNumber;
        public String qrToken;
        public String ticketTier;
        public String attendeeName;
        public String attendeeEmail;
        public String eventCode;
        public String eventName;
        public String venue;
    }
    
    public class RequestWrapper {
        public List<TicketPayload> registrations;
    }
    
    public class NodeTicketResponse {
        public Boolean success;
        public Map<String, String> qrUrls;
    }
    
    public EventRegistrationSyncQueueable(Set<Id> regIds) {
        this.registrationIds = regIds;
    }
    
    public void execute(QueueableContext context) {
        List<Event_Registration__c> regsToSync = [
            SELECT Id, Name, QR_Code_Token__c, Ticket_Tier__c, Status__c,
                   Attendee__r.Name, Attendee__r.Email,
                   Smart_Event__c, Smart_Event__r.Name, Smart_Event__r.Event_Code__c,
                   Smart_Event__r.Start_Date_Time__c, Smart_Event__r.Venue__c
            FROM Event_Registration__c
            WHERE Id IN :registrationIds
        ];
        
        if (regsToSync.isEmpty()) {
            return;
        }
        
        RequestWrapper wrapper = new RequestWrapper();
        wrapper.registrations = new List<TicketPayload>();
        
        for (Event_Registration__c reg : regsToSync) {
            TicketPayload item = new TicketPayload();
            item.registrationId = reg.Id;
            item.registrationNumber = reg.Name;
            item.qrToken = reg.QR_Code_Token__c;
            item.ticketTier = reg.Ticket_Tier__c;
            item.attendeeName = reg.Attendee__r.Name;
            item.attendeeEmail = reg.Attendee__r.Email;
            item.eventCode = reg.Smart_Event__r.Event_Code__c;
            item.eventName = reg.Smart_Event__r.Name;
            item.venue = reg.Smart_Event__r.Venue__c;
            wrapper.registrations.add(item);
        }
        
        String requestBody = JSON.serialize(wrapper);
        String endpointPath = 'callout:Node_Event_Service/api/tickets/generate';
        
        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpointPath);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setBody(requestBody);
        req.setTimeout(15000);
        
        Http http = new Http();
        HttpResponse res;
        Integer statusCode = 0;
        String responseBody = '';
        
        List<Event_Integration_Log__c> logsToInsert = new List<Event_Integration_Log__c>();
        List<Event_Registration__c> regsToUpdate = new List<Event_Registration__c>();
        
        try {
            res = http.send(req);
            statusCode = res.getStatusCode();
            responseBody = res.getBody();
            
            if (statusCode == 200 || statusCode == 201) {
                NodeTicketResponse parsedResponse = (NodeTicketResponse) JSON.deserialize(responseBody, NodeTicketResponse.class);
                
                for (Event_Registration__c reg : regsToSync) {
                    if (parsedResponse.qrUrls != null && parsedResponse.qrUrls.containsKey(reg.QR_Code_Token__c)) {
                        reg.QR_Code_Image_URL__c = parsedResponse.qrUrls.get(reg.QR_Code_Token__c);
                        regsToUpdate.add(reg);
                    }
                }
            }
        } catch (Exception e) {
            statusCode = 500;
            responseBody = 'Callout Exception: ' + e.getMessage() + ' | ' + e.getStackTraceString();
        }
        
       logsToInsert.add(new Event_Integration_Log__c(
            Related_Event__c = regsToSync[0].Smart_Event__c,
            Direction__c = 'Outbound (SF -> Node)',
            Endpoint__c = endpointPath,
            HTTP_Status_Code__c = statusCode,
            Request_Payload__c = requestBody,
            Response_Body__c = responseBody
        ));
        
        if (!regsToUpdate.isEmpty()) {
            update regsToUpdate;
        }
        if (!logsToInsert.isEmpty()) {
            insert logsToInsert;
        }
    }
}