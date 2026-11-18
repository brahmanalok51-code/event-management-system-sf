trigger EventRegistrationTrigger on Event_Registration__c (before insert, after insert, after update) {
    if (Trigger.isBefore && Trigger.isInsert) {
        EventRegistrationTriggerHandler.handleBeforeInsert(Trigger.new);
    }
    if (Trigger.isAfter && Trigger.isInsert) {
        EventRegistrationTriggerHandler.handleAfterInsert(Trigger.new);
    }
    if (Trigger.isAfter && Trigger.isUpdate) {
        EventRegistrationTriggerHandler.handleAfterUpdate(Trigger.new, Trigger.oldMap);
    }
}