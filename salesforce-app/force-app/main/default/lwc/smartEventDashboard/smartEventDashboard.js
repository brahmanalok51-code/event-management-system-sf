import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { publish, MessageContext } from 'lightning/messageService';
import SMART_EVENT_CHANNEL from '@salesforce/messageChannel/SmartEventChannel__c';
import getEventsWithStats from '@salesforce/apex/SmartEventController.getEventsWithStats';

export default class SmartEventDashboard extends LightningElement {
    wiredEventsResult;
    allEvents = [];
    selectedEventId;

    // SOSL Search State
    isSearchActive = false;
    searchEvents = [];
    matchingRegistrations = [];

    @wire(MessageContext)
    messageContext;

    @wire(getEventsWithStats)
    wiredEvents(result) {
        this.wiredEventsResult = result;
        if (result.data) {
            this.allEvents = result.data;
        } else if (result.error) {
            console.error('Error loading events:', result.error);
        }
    }

    get displayedEvents() {
        return this.isSearchActive ? this.searchEvents : this.allEvents;
    }

    get hasMatchingRegistrations() {
        return this.isSearchActive && this.matchingRegistrations.length > 0;
    }

    get totalEventsCount() {
        return this.allEvents.length;
    }

    get totalRegisteredCount() {
        return this.allEvents.reduce((sum, evt) => sum + (evt.Total_Registered__c || 0), 0);
    }

    get totalAvailableSeats() {
        return this.allEvents.reduce((sum, evt) => sum + (evt.Available_Seats__c || 0), 0);
    }

    handleEventSelect(event) {
        this.selectedEventId = event.detail.eventId;
    }

    handleSearchResult(event) {
        const { isActive, events, registrations } = event.detail;
        this.isSearchActive = isActive;
        this.searchEvents = events || [];
        this.matchingRegistrations = (registrations || []).map((reg) => ({
            ...reg,
            attendeeName: reg.Attendee__r ? reg.Attendee__r.Name : 'Unknown',
            eventName: reg.Smart_Event__r ? reg.Smart_Event__r.Name : 'Event'
        }));
    }

    // Search result mein kisi attendee pill par click karne par uska event open karein
    handleSearchRegClick(event) {
        const eventId = event.currentTarget.dataset.eventid;
        const eventName = event.currentTarget.dataset.eventname;
        if (eventId) {
            this.selectedEventId = eventId;
            publish(this.messageContext, SMART_EVENT_CHANNEL, { eventId, eventName });
        }
    }

    // Naya ticket issue hone par KPI counters aur available seats refresh karein
    async handleRegistrationCreated() {
        if (this.wiredEventsResult) {
            await refreshApex(this.wiredEventsResult);
        }
    }
}