require('dotenv').config();
const express = require('express');
const jsforce = require('jsforce');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Request Logger: Har incoming request terminal mein print karega
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Root Route: Browser mein "/" kholne par "Cannot GET /" hatane ke liye
app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Smart Event Node.js Microservice is Running!'
    });
});

// Salesforce OAuth 2.0 Client Credentials se Access Token lena
async function connectSalesforce() {
    const tokenUrl = `${process.env.SF_LOGIN_URL}/services/oauth2/token`;
    
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.SF_CLIENT_ID);
    params.append('client_secret', process.env.SF_CLIENT_SECRET);

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error_description || 'Salesforce Auth Failed');
    }

    return new jsforce.Connection({
        instanceUrl: data.instance_url,
        accessToken: data.access_token
    });
}

// 1. OUTBOUND RECEIVER: Salesforce Queueable -> Node.js (QR Code URLs return karega)
app.post('/api/tickets/generate', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (apiKey !== process.env.NODE_API_SECRET) {
            console.warn('[Auth Failed] Invalid x-api-key received');
            return res.status(401).json({ success: false, message: 'Unauthorized API Key' });
        }

        const { registrations } = req.body;
        if (!registrations || !Array.isArray(registrations)) {
            return res.status(400).json({ success: false, message: 'Invalid registrations payload' });
        }

        const qrUrls = {};
        for (const reg of registrations) {
            const encodedToken = encodeURIComponent(reg.qrToken);
            qrUrls[reg.qrToken] = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodedToken}`;
            console.log(`[QR Generated] ${reg.attendeeName} (${reg.ticketTier}) -> ${reg.qrToken}`);
        }

        return res.status(200).json({
            success: true,
            qrUrls: qrUrls
        });
    } catch (error) {
        console.error('Ticket Generation Error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// 2. INBOUND CALLER: Gate Scanner -> Node.js -> Salesforce Apex REST API (@HttpPatch)
app.post('/api/gate/scan', async (req, res) => {
    const { qrToken, gateNumber } = req.body;

    if (!qrToken) {
        return res.status(400).json({ success: false, message: 'qrToken is required' });
    }

    try {
        const conn = await connectSalesforce();

        // Custom @RestResource('/SmartEvent/v1/checkin/*') ko call karna
        const sfResponse = await conn.apex.patch('/SmartEvent/v1/checkin', {
            qrToken: qrToken,
            gateNumber: gateNumber || 'GATE-A1'
        });

        console.log('[Salesforce Check-In Response]:', sfResponse);
        return res.status(200).json(sfResponse);
    } catch (error) {
        console.error('Salesforce Check-In Error:', error.message);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to sync check-in with Salesforce'
        });
    }
});

// 3. Test Route
app.get('/api/test-sf', async (req, res) => {
    try {
        const conn = await connectSalesforce();
        const result = await conn.query('SELECT Id, Name FROM Smart_Event__c LIMIT 5');
        res.json({
            success: true,
            message: 'Connected to Salesforce successfully!',
            totalRecords: result.totalSize,
            records: result.records
        });
    } catch (error) {
        console.error('SF Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Smart Event Server running on http://localhost:${PORT}`);
});