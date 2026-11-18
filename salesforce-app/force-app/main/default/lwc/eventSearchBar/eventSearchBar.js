import { LightningElement } from 'lwc';
import searchEventsAndAttendees from '@salesforce/apex/SmartEventController.searchEventsAndAttendees';

export default class EventSearchBar extends LightningElement {
    searchTerm = '';
    isSearching = false;
    delayTimeout;

    get isClearDisabled() {
        return !this.searchTerm || this.searchTerm.length === 0;
    }

    handleInputChange(event) {
        const value = event.target.value;
        this.searchTerm = value;

        // Purana timer clear karein (Debouncing)
        window.clearTimeout(this.delayTimeout);

        if (!value || value.trim().length < 2) {
            this.dispatchSearchEvent(false, [], []);
            return;
        }

        // 300ms ruk kar SOSL Apex call karein
        this.delayTimeout = setTimeout(() => {
            this.executeSoslSearch(value.trim());
        }, 300);
    }

    async executeSoslSearch(term) {
        this.isSearching = true;
        try {
            const result = await searchEventsAndAttendees({ searchTerm: term });
            const events = result.events || [];
            const registrations = result.registrations || [];
            this.dispatchSearchEvent(true, events, registrations);
        } catch (error) {
            console.error('SOSL Search Error:', error);
            this.dispatchSearchEvent(true, [], []);
        } finally {
            this.isSearching = false;
        }
    }

    handleClear() {
        this.searchTerm = '';
        window.clearTimeout(this.delayTimeout);
        this.dispatchSearchEvent(false, [], []);
    }

    // Child -> Parent CustomEvent dispatch
    dispatchSearchEvent(isActive, events, registrations) {
        this.dispatchEvent(new CustomEvent('searchresult', {
            detail: {
                isActive,
                searchTerm: this.searchTerm,
                events,
                registrations
            }
        }));
    }
}