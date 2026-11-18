@RestResource(urlMapping='/SmartEvent/v1/checkin/*')
global with sharing class SmartEventRestService {
    
    // Request aur Response ke liye clean Wrapper classes
    global class CheckInRequest {
        public String qrToken;
        public String gateNumber;
    }
    
    global class CheckInResponse {
        public Boolean success;
        public String message;
        public String attendeeName;
        public String ticketTier;
        public Datetime checkedInAt;
    }
    
    @HttpPatch
    global static CheckInResponse processGateCheckIn() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;
        CheckInResponse responseObj = new CheckInResponse();
        
        String rawBody = req.requestBody != null ? req.requestBody.toString() : '';
        Id relatedEventId = null;
        
        try {
            CheckInRequest input = (CheckInRequest) JSON.deserialize(rawBody, CheckInRequest.class);
            
            if (String.isBlank(input.qrToken)) {
                res.statusCode = 400;
                responseObj.success = false;
                responseObj.message = 'QR Token is required.';
                return responseObj;
            }
            
            List<Event_Registration__c> regs = [
                SELECT Id, Name, Status__c, Ticket_Tier__c, Checked_In_At__c,
                       Attendee__r.Name, Smart_Event__c
                FROM Event_Registration__c
                WHERE QR_Code_Token__c = :input.qrToken.trim()
                LIMIT 1
            ];
            
            if (regs.isEmpty()) {
                res.statusCode = 404;
                responseObj.success = false;
                responseObj.message = 'Invalid Ticket: QR Token not found.';
                return responseObj;
            }
            
            Event_Registration__c ticket = regs[0];
            relatedEventId = ticket.Smart_Event__c;
            
            // Duplicate Gate Scan Check
            if (ticket.Status__c == 'Attended') {
                res.statusCode = 409; // Conflict
                responseObj.success = false;
                responseObj.message = 'Already Checked-In at ' + String.valueOf(ticket.Checked_In_At__c);
                responseObj.attendeeName = ticket.Attendee__r.Name;
                responseObj.ticketTier = ticket.Ticket_Tier__c;
                responseObj.checkedInAt = ticket.Checked_In_At__c;
                return responseObj;
            }
            
            if (ticket.Status__c == 'Cancelled') {
                res.statusCode = 403;
                responseObj.success = false;
                responseObj.message = 'Access Denied: This ticket has been cancelled.';
                return responseObj;
            }
            
            // Valid Ticket -> Update Status to Attended
            ticket.Status__c = 'Attended';
            ticket.Checked_In_At__c = System.now();
            update ticket;
            
            res.statusCode = 200;
            responseObj.success = true;
            responseObj.message = 'Check-in successful! Welcome to the event.';
            responseObj.attendeeName = ticket.Attendee__r.Name;
            responseObj.ticketTier = ticket.Ticket_Tier__c;
            responseObj.checkedInAt = ticket.Checked_In_At__c;
            
        } catch (Exception e) {
            res.statusCode = 500;
            responseObj.success = false;
            responseObj.message = 'Server Error: ' + e.getMessage();
       } finally {
            // Inbound traffic ko bhi Integration Log mein record karein
            insert new Event_Integration_Log__c(
                Related_Event__c = relatedEventId,
                Direction__c = 'Inbound (Node -> SF)',
                Endpoint__c = '/services/apexrest/SmartEvent/v1/checkin',
                HTTP_Status_Code__c = res.statusCode,
                Request_Payload__c = rawBody,
                Response_Body__c = JSON.serialize(responseObj)
            );
        }
        
        return responseObj;
    }
}