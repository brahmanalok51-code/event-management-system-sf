import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { subscribe, unsubscribe, MessageContext } from 'lightning/messageService';
import SMART_EVENT_CHANNEL from '@salesforce/messageChannel/SmartEventChannel__c';
import getEventRegistrations from '@salesforce/apex/SmartEventController.getEventRegistrations';
import createRegistration from '@salesforce/apex/SmartEventController.createRegistration';
import createWalkInRegistration from '@salesforce/apex/SmartEventController.createWalkInRegistration';
import updateRegistrationStatus from '@salesforce/apex/SmartEventController.updateRegistrationStatus';
import isCurrentUserAdmin from '@salesforce/apex/SmartEventController.isCurrentUserAdmin';

export default class EventDetailInspector extends NavigationMixin(LightningElement) {
    selectedEventId;
    selectedEventName;
    registrations = [];
    isLoading = false;
    isRegistering = false;
    isAdmin = false;

    registrationMode = 'existing';
    selectedContactId;
    selectedTier = 'General';

    firstName = '';
    lastName = '';
    email = '';

    subscription = null;

    @wire(MessageContext)
    messageContext;

    @wire(isCurrentUserAdmin)
    wiredAdminCheck({ data }) {
        if (data !== undefined) {
            this.isAdmin = data;
        }
    }

    get isExistingMode() {
        return this.registrationMode === 'existing';
    }

    get existingModeVariant() {
        return this.isExistingMode ? 'brand' : 'neutral';
    }

    get newModeVariant() {
        return !this.isExistingMode ? 'brand' : 'neutral';
    }

    get tierOptions() {
        return [
            { label: 'General', value: 'General' },
            { label: 'VIP', value: 'VIP' },
            { label: 'Speaker', value: 'Speaker' }
        ];
    }

    get cardTitle() {
        return this.selectedEventName
            ? `Event Inspector: ${this.selectedEventName}`
            : 'Event & QR Pass Inspector';
    }

    get hasRegistrations() {
        return Array.isArray(this.registrations) && this.registrations.length > 0;
    }

    get decoratedRegistrations() {
        return (this.registrations || []).map((reg) => {
            const isPending = reg.Status__c === 'Pending';
            const isConfirmed = reg.Status__c === 'Confirmed';
            const isAttended = reg.Status__c === 'Attended';
            const isCancelled = reg.Status__c === 'Cancelled';

            let badgeClass = 'slds-badge';
            if (isAttended) badgeClass = 'slds-badge slds-theme_success';
            else if (isConfirmed) badgeClass = 'slds-badge slds-theme_info';
            else if (isPending) badgeClass = 'slds-badge slds-theme_warning';
            else if (isCancelled) badgeClass = 'slds-badge slds-theme_error';

            return {
                ...reg,
                attendeeName: reg.Attendee__r ? reg.Attendee__r.Name : 'Unknown Attendee',
                isPending,
                isConfirmed,
                isAttended,
                isCancelled,
                statusBadgeClass: badgeClass
            };
        });
    }

    connectedCallback() {
        if (!this.subscription) {
            this.subscription = subscribe(
                this.messageContext,
                SMART_EVENT_CHANNEL,
                (message) => this.handleEventMessage(message)
            );
        }
    }

    disconnectedCallback() {
        unsubscribe(this.subscription);
        this.subscription = null;
    }

    setExistingMode() {
        this.registrationMode = 'existing';
    }

    setNewMode() {
        this.registrationMode = 'new';
    }

    handleEventMessage(message) {
        if (message && message.eventId) {
            this.selectedEventId = message.eventId;
            this.selectedEventName = message.eventName;
            this.loadRegistrations();
        }
    }

    async loadRegistrations() {
        if (!this.selectedEventId) return;
        this.isLoading = true;
        try {
            const data = await getEventRegistrations({ eventId: this.selectedEventId });
            this.registrations = data;
        } catch (error) {
            this.showToast('Error Loading Registrations', this.extractError(error), 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleRefresh() {
        this.loadRegistrations();
        this.showToast('Synced', 'Latest ticket statuses and QR passes refreshed.', 'info');
    }

    handleNavigateToEvent() {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: this.selectedEventId,
                objectApiName: 'Smart_Event__c',
                actionName: 'view'
            }
        });
    }

    handleContactChange(event) {
        this.selectedContactId = event.detail.recordId;
    }

    handleFirstNameChange(event) {
        this.firstName = event.target.value;
    }

    handleLastNameChange(event) {
        this.lastName = event.target.value;
    }

    handleEmailChange(event) {
        this.email = event.target.value;
    }

    handleTierChange(event) {
        this.selectedTier = event.detail.value;
    }

    async handleQuickRegister() {
        if (!this.selectedContactId) {
            this.showToast('Missing Attendee', 'Please select a Contact before requesting a ticket.', 'warning');
            return;
        }

        this.isRegistering = true;
        try {
            await createRegistration({
                eventId: this.selectedEventId,
                contactId: this.selectedContactId,
                ticketTier: this.selectedTier
            });
            this.onTicketRequested();
        } catch (error) {
            this.showToast('Request Failed', this.extractError(error), 'error');
        } finally {
            this.isRegistering = false;
        }
    }

    async handleWalkInRegister() {
        if (!this.lastName || !this.lastName.trim()) {
            this.showToast('Missing Name', 'Last Name is required to register a new attendee.', 'warning');
            return;
        }

        this.isRegistering = true;
        try {
            await createWalkInRegistration({
                eventId: this.selectedEventId,
                firstName: this.firstName,
                lastName: this.lastName,
                email: this.email,
                ticketTier: this.selectedTier
            });
            this.firstName = '';
            this.lastName = '';
            this.email = '';
            this.onTicketRequested();
        } catch (error) {
            this.showToast('Request Failed', this.extractError(error), 'error');
        } finally {
            this.isRegistering = false;
        }
    }

    onTicketRequested() {
        this.showToast(
            'Ticket Requested (Pending)',
            'Your request has been submitted and is awaiting Admin approval.',
            'info'
        );
        this.dispatchEvent(new CustomEvent('registrationcreated'));
        this.loadRegistrations();
    }

    // Admin Action: Approve (Pending -> Confirmed), Desk Check-In, or Cancel
    async handleStatusAction(event) {
        const registrationId = event.currentTarget.dataset.id;
        const newStatus = event.currentTarget.dataset.status;

        this.isLoading = true;
        try {
            await updateRegistrationStatus({ registrationId, newStatus });

            if (newStatus === 'Confirmed') {
                this.showToast(
                    'Approved & Confirmed!',
                    'Node.js is generating the QR pass now—auto-refreshing in 3 seconds.',
                    'success'
                );
                // eslint-disable-next-line @lwc/lwc/no-async-operation
                setTimeout(() => {
                    this.loadRegistrations();
                }, 3000);
            } else {
                this.showToast('Status Updated', `Ticket marked as ${newStatus}.`, 'success');
            }

            this.dispatchEvent(new CustomEvent('registrationcreated'));
            await this.loadRegistrations();
        } catch (error) {
            this.showToast('Update Failed', this.extractError(error), 'error');
        } finally {
            this.isLoading = false;
        }
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    extractError(error) {
        if (error?.body?.message) return error.body.message;
        return error?.message || 'Unexpected error occurred';
    }
}