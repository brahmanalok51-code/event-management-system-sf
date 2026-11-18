import { LightningElement, api, wire } from 'lwc';
import { publish, MessageContext } from 'lightning/messageService';
import SMART_EVENT_CHANNEL from '@salesforce/messageChannel/SmartEventChannel__c';

export default class EventListPanel extends LightningElement {
    @api events = [];
    @api selectedEventId;

    // LMS MessageContext inject karna
    @wire(MessageContext)
    messageContext;

    get hasEvents() {
        return Array.isArray(this.events) && this.events.length > 0;
    }

    get eventCountLabel() {
        const count = this.events ? this.events.length : 0;
        return `${count} Event${count === 1 ? '' : 's'}`;
    }

    // Har event ke liye dynamic CSS class aur seat status compute karna
    get decoratedEvents() {
        return (this.events || []).map((evt) => {
            const isSelected = evt.Id === this.selectedEventId;
            const available = evt.Available_Seats__c ?? 0;
            const isSoldOut = available <= 0;

            return {
                ...evt,
                cardClass: `event-card slds-box slds-box_x-small slds-m-bottom_small ${
                    isSelected ? 'selected-card' : ''
                }`,
                seatBadgeClass: isSoldOut
                    ? 'slds-badge slds-theme_error'
                    : 'slds-badge slds-theme_success',
                seatLabel: isSoldOut ? 'Sold Out' : `${available} Seats Left`
            };
        });
    }

    handleEventSelect(event) {
        const eventId = event.currentTarget.dataset.id;
        const eventName = event.currentTarget.dataset.name;

        // 1. LMS ke through sibling component (eventDetailInspector) ko broadcast karein
        const payload = {
            eventId: eventId,
            eventName: eventName
        };
        publish(this.messageContext, SMART_EVENT_CHANNEL, payload);

        // 2. Parent (smartEventDashboard) ko bhi notify karein taaki selected highlight update ho
        this.dispatchEvent(
            new CustomEvent('eventselect', {
                detail: { eventId, eventName }
            })
        );
    }
}