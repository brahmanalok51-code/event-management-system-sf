public with sharing class SmartEventController {

    // 1. Dashboard ke liye Events aur unke nested Registrations fetch karna
    @AuraEnabled(cacheable=true)
    public static List<Smart_Event__c> getEventsWithStats() {
        return [
            SELECT Id, Name, Event_Code__c, Start_Date_Time__c, End_Date_Time__c,
                   Venue__c, Max_Capacity__c, Total_Registered__c,
                   Available_Seats__c, Event_Status__c, External_Sync_Status__c,
                   (SELECT Id, Name, Attendee__r.Name, Attendee__r.Email,
                           Ticket_Tier__c, Status__c, QR_Code_Token__c,
                           QR_Code_Image_URL__c, Checked_In_At__c
                    FROM Event_Registrations__r
                    ORDER BY CreatedDate DESC)
            FROM Smart_Event__c
            WHERE Event_Status__c != 'Cancelled'
            ORDER BY Start_Date_Time__c ASC
            LIMIT 50
        ];
    }

    // 2. SOSL Global Search
    @AuraEnabled
    public static Map<String, List<SObject>> searchEventsAndAttendees(String searchTerm) {
        Map<String, List<SObject>> resultMap = new Map<String, List<SObject>>();

        if (String.isBlank(searchTerm) || searchTerm.trim().length() < 2) {
            return resultMap;
        }

        String sanitizedTerm = String.escapeSingleQuotes(searchTerm.trim()) + '*';

        List<List<SObject>> searchResults = [
            FIND :sanitizedTerm
            IN ALL FIELDS
            RETURNING
                Smart_Event__c(Id, Name, Event_Code__c, Venue__c, Start_Date_Time__c, Available_Seats__c, Event_Status__c),
                Event_Registration__c(Id, Name, QR_Code_Token__c, Ticket_Tier__c, Status__c, Attendee__r.Name, Smart_Event__c, Smart_Event__r.Name)
        ];

        resultMap.put('events', searchResults[0]);
        resultMap.put('registrations', searchResults[1]);

        return resultMap;
    }

    // 3. Existing Contact ke liye Ticket Request raise karna (Initial Status = Pending)
    @AuraEnabled
    public static Event_Registration__c createRegistration(Id eventId, Id contactId, String ticketTier) {
        try {
            Event_Registration__c newReg = new Event_Registration__c(
                Smart_Event__c = eventId,
                Attendee__c = contactId,
                Ticket_Tier__c = ticketTier,
                Status__c = 'Pending'
            );
            insert newReg;

            return [
                SELECT Id, Name, QR_Code_Token__c, QR_Code_Image_URL__c, Ticket_Tier__c, Status__c, Attendee__r.Name
                FROM Event_Registration__c
                WHERE Id = :newReg.Id
            ];
        } catch (DmlException e) {
            throw new AuraHandledException(e.getDmlMessage(0));
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    // 4. Walk-in New Attendee ke liye Contact + Pending Ticket Request create karna
    @AuraEnabled
    public static Event_Registration__c createWalkInRegistration(
        Id eventId,
        String firstName,
        String lastName,
        String email,
        String ticketTier
    ) {
        try {
            if (String.isBlank(lastName)) {
                throw new AuraHandledException('Last Name is required for a new attendee.');
            }

            Id contactId;
            if (String.isNotBlank(email)) {
                List<Contact> existingContacts = [
                    SELECT Id FROM Contact WHERE Email = :email.trim() LIMIT 1
                ];
                if (!existingContacts.isEmpty()) {
                    contactId = existingContacts[0].Id;
                }
            }

            if (contactId == null) {
                Contact newContact = new Contact(
                    FirstName = String.isNotBlank(firstName) ? firstName.trim() : null,
                    LastName = lastName.trim(),
                    Email = String.isNotBlank(email) ? email.trim() : null
                );
                insert newContact;
                contactId = newContact.Id;
            }

            Event_Registration__c newReg = new Event_Registration__c(
                Smart_Event__c = eventId,
                Attendee__c = contactId,
                Ticket_Tier__c = ticketTier,
                Status__c = 'Pending'
            );
            insert newReg;

            return [
                SELECT Id, Name, QR_Code_Token__c, QR_Code_Image_URL__c, Ticket_Tier__c, Status__c, Attendee__r.Name
                FROM Event_Registration__c
                WHERE Id = :newReg.Id
            ];
        } catch (DmlException e) {
            throw new AuraHandledException(e.getDmlMessage(0));
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    // 5. Single Event ke latest Registrations fetch karna
    @AuraEnabled
    public static List<Event_Registration__c> getEventRegistrations(Id eventId) {
        return [
            SELECT Id, Name, Attendee__r.Name, Attendee__r.Email,
                   Ticket_Tier__c, Status__c, QR_Code_Token__c,
                   QR_Code_Image_URL__c, Checked_In_At__c
            FROM Event_Registration__c
            WHERE Smart_Event__c = :eventId
            ORDER BY CreatedDate DESC
        ];
    }

    // 6. Admin Approval / Rejection / Status Update
    @AuraEnabled
    public static void updateRegistrationStatus(Id registrationId, String newStatus) {
        try {
            if (!isCurrentUserAdmin()) {
                throw new AuraHandledException('Only System Administrators can approve or update ticket statuses.');
            }

            Event_Registration__c reg = new Event_Registration__c(
                Id = registrationId,
                Status__c = newStatus
            );
            if (newStatus == 'Attended') {
                reg.Checked_In_At__c = System.now();
            }
            update reg;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getDmlMessage(0));
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    // 7. Role Check: Logged-in user System Administrator hai ya nahi
    @AuraEnabled(cacheable=true)
    public static Boolean isCurrentUserAdmin() {
        Profile userProfile = [
            SELECT Name
            FROM Profile
            WHERE Id = :UserInfo.getProfileId()
            LIMIT 1
        ];
        return userProfile.Name == 'System Administrator';
    }
}