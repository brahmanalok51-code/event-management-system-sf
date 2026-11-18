public with sharing class EventRegistrationTriggerHandler {

    // 1. Before Insert: Unique QR Token generate karna
    public static void handleBeforeInsert(List<Event_Registration__c> newList) {
        for (Event_Registration__c reg : newList) {
            if (String.isBlank(reg.QR_Code_Token__c)) {
                Blob randomBlob = Crypto.generateAesKey(128);
                String hexKey = EncodingUtil.convertToHex(randomBlob).substring(0, 16).toUpperCase();
                reg.QR_Code_Token__c = 'TKT-' + hexKey;
            }
            if (String.isBlank(reg.Status__c)) {
                reg.Status__c = 'Pending';
            }
        }
    }

    // 2. After Insert: Agar seedha Confirmed insert hua hai toh QR sync enqueue karein
    public static void handleAfterInsert(List<Event_Registration__c> newList) {
        Set<Id> confirmedIds = new Set<Id>();
        for (Event_Registration__c reg : newList) {
            if (reg.Status__c == 'Confirmed' && String.isBlank(reg.QR_Code_Image_URL__c)) {
                confirmedIds.add(reg.Id);
            }
        }
        if (!confirmedIds.isEmpty()) {
            System.enqueueJob(new EventRegistrationSyncQueueable(confirmedIds));
        }
    }

    // 3. After Update: Admin jab Pending -> Confirmed kare tab Node.js se QR generate karwayein
    public static void handleAfterUpdate(List<Event_Registration__c> newList, Map<Id, Event_Registration__c> oldMap) {
        Set<Id> newlyConfirmedIds = new Set<Id>();
        for (Event_Registration__c reg : newList) {
            Event_Registration__c oldReg = oldMap.get(reg.Id);
            if (reg.Status__c == 'Confirmed'
                && oldReg.Status__c != 'Confirmed'
                && String.isBlank(reg.QR_Code_Image_URL__c)) {
                newlyConfirmedIds.add(reg.Id);
            }
        }
        if (!newlyConfirmedIds.isEmpty()) {
            System.enqueueJob(new EventRegistrationSyncQueueable(newlyConfirmedIds));
        }
    }
}