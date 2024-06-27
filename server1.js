const express = require('express');
const axios = require('axios');
const { Client, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const cors = require("cors");
app.use(cors());

const port =  3000;
const externalUrl = 'https://mail.google.com/mail/u/0/'; // Replace with the URL you want to check

let clients = {};
let client;
let server;

app.use(express.json());

app.get('/', (req, res) => {
    res.send('WhatsApp API is running');
});

app.get('/init-session', async (req, res) => {
    const { nickname } = req.body;
    const sessionId = uuidv4();
    client = new Client({
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        }
      
    });

    clients[sessionId] = { client, qrCodeData: '', isClientReady: false, nickname };

    client.on('qr', (qr) => {
        qrcode.toDataURL(qr, (err, url) => {
            clients[sessionId].qrCodeData = url;
            clients[sessionId].isClientReady = false;
        });
           console.log(`QR code received for session ${sessionId}. Access it via /qr/${sessionId}`);

    });

    client.on('ready', () => {
        clients[sessionId].isClientReady = true;
    console.log(`Client is ready for session ${sessionId}!`);

    });

    client.initialize();

    res.status(200).json({ status: true, sessionId, nickname });
});

app.get('/qr/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    if (clients[sessionId]) {
        if (clients[sessionId].qrCodeData) {
                      res.send(`<img src="${clients[sessionId].qrCodeData}" alt="QR Code" />`);

        } else {
            res.send('QR code is not generated yet. Please wait.');
        }
    } else {
        res.status(404).json({ status: false, message: 'Session not found' });
    }
});

app.get('/qr-status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    if (clients[sessionId]) {
        if (clients[sessionId].isClientReady) {
            res.status(200).json({ status: true, message: 'QR code scanned successfully' });
        } else {
            res.status(200).json({ status: false, message: 'QR code not scanned yet' });
        }
    } else {
        res.status(404).json({ status: false, message: 'Session not found' });
    }
});

app.post('/send-message', async (req, res) => {
    const { sessionId, numbers, message, mediaType, mediaUrl } = req.body;
    console.log('Session ID:', sessionId);
    console.log('Numbers:', numbers);
    console.log('Message:', message);
    console.log('Media Type:', mediaType);
    console.log('Media URL:', mediaUrl);
    if (!sessionId || !numbers || !message || !mediaUrl) {
        return res.status(400).json({ status: false, message: 'Session ID, numbers, message, and mediaUrl are required' });
    }

    const numbersArray = numbers[0].split(',');

    if (!Array.isArray(numbersArray)) {
        return res.status(400).json({ status: false, message: 'Numbers should be provided as a comma-separated list' });
    }

    const clientData = clients[sessionId];
    if (!clientData) {
        return res.status(404).json({ status: false, message: 'Session not found' });
    }

    try {
        for (const number of numbersArray) {
            const chatId = `${number}@c.us`;

            if (mediaType && ['image', 'video', 'document'].includes(mediaType)) {
                const media = await MessageMedia.fromUrl(mediaUrl);
                await clientData.client.sendMessage(chatId, media, { caption: message });
            } else {
                await clientData.client.sendMessage(chatId, message);
            }
        }

        res.status(200).json({ status: true, message: 'Message sent successfully to all recipients' });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Failed to send message', error: error.message });
        console.log('error', error);
    }
});


app.get('/stop', (req, res) => {
    res.send('Stopping server...');
    console.log('Stopping server...');
    server.close(() => {
        console.log('Server stopped.');
        process.exit(0);
    });
});

app.get('/destroy-session/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const clientData = clients[sessionId];
    
    if (clientData) {
        try {
            await clientData.client.logout();
            delete clients[sessionId];
            res.status(200).json({ status: true, message: `Session ${sessionId} destroyed successfully` });
            console.log(`Session ${sessionId} destroyed successfully`);
        } catch (error) {
            res.status(500).json({ status: false, message: 'Failed to destroy session', error: error.message });
            console.log('Error destroying session:', error);
        }
    } else {
        res.status(404).json({ status: false, message: 'Session not found' });
    }
});


app.get('/sessions', (req, res) => {
    const activeSessions = Object.keys(clients)
        .filter(sessionId => clients[sessionId].isClientReady) // Filter sessions where isClientReady is true
        .map(sessionId => {
            return {
                sessionId: sessionId,
                isClientReady: clients[sessionId].isClientReady,
                nickname: clients[sessionId].nickname
            };
        });

    res.status(200).json({ status: true, sessions: activeSessions });
});

const checkUrlAndStartServer = async () => {
    try {
        await axios.get(externalUrl);
        console.log(`URL ${externalUrl} is reachable. Starting server...`);
        server = app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });

        setInterval(async () => {
            try {
                await axios.get(externalUrl);
            } catch (error) {
                console.error(`URL ${externalUrl} is not reachable. Stopping server...`);
                server.close(() => {
                    console.log('Server stopped.');
                    process.exit(1);
                });
            }
        }, 60000); // Check every minute
    } catch (error) {
        console.error(`URL ${externalUrl} is not reachable. Server will not start.`);
    }
};

checkUrlAndStartServer();