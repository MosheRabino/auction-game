const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// הגדרת CORS כדי ש-GitHub Pages יוכל לדבר עם השרת הזה
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const playersPool = [
    { name: "ערן זהבי", team: "מכבי תל אביב" }, { name: "מנור סולומון", team: "טוטנהאם" },
    { name: "אוסקר גלוך", team: "רד בול זלצבורג" }, { name: "דני אבדיה", team: "פורטלנד" },
    { name: "ים מדר", team: "באיירן מינכן" }, { name: "קיליאן אמבפה", team: "ריאל מדריד" }
];

let rooms = {};

io.on('connection', (socket) => {
    
    socket.on('join-room', ({ roomCode, username }) => {
        socket.join(roomCode);
        
        if (!rooms[roomCode]) {
            rooms[roomCode] = {
                p1: { id: socket.id, name: username, money: 20, roster: [] },
                p2: null,
                gameState: {
                    currentBid: 1, leadingBidder: 'p1', currentTurn: 'p1',
                    lotIndex: 0, isInitial: true, started: false
                }
            };
            socket.emit('init-role', 'p1');
        } else if (!rooms[roomCode].p2 && rooms[roomCode].p1.id !== socket.id) {
            rooms[roomCode].p2 = { id: socket.id, name: username, money: 20, roster: [] };
            rooms[roomCode].gameState.started = true;
            socket.emit('init-role', 'p2');
            io.to(roomCode).emit('game-sync', rooms[roomCode]);
        } else {
            // החדר מלא או שהשחקן כבר בפנים
            if (rooms[roomCode].p1.id === socket.id) socket.emit('init-role', 'p1');
            if (rooms[roomCode].p2 && rooms[roomCode].p2.id === socket.id) socket.emit('init-role', 'p2');
            socket.emit('game-sync', rooms[roomCode]);
        }
    });

    socket.on('game-action', ({ roomCode, actionType, data }) => {
        const room = rooms[roomCode];
        if (!room) return;

        let state = room.gameState;

        if (actionType === 'bid') {
            state.currentBid = data.amount;
            state.leadingBidder = data.sender;
            state.isInitial = false;
            state.currentTurn = data.sender === 'p1' ? 'p2' : 'p1';
        } else if (actionType === 'pass') {
            if (state.isInitial && state.currentTurn === state.leadingBidder) {
                state.isInitial = false;
                state.currentTurn = state.currentTurn === 'p1' ? 'p2' : 'p1';
            } else {
                // מכירה נסגרה - קנייה!
                const winner = state.leadingBidder;
                const cost = state.currentBid;
                const item = playersPool[state.lotIndex % playersPool.length];
                const text = `${item.name} ($${cost})`;

                if (winner === 'p1') {
                    room.p1.money -= cost;
                    room.p1.roster.push(text);
                } else {
                    room.p2.money -= cost;
                    room.p2.roster.push(text);
                }

                state.lotIndex++;
                state.currentBid = 1;
                state.leadingBidder = state.lotIndex % 2 === 0 ? 'p1' : 'p2';
                state.currentTurn = state.leadingBidder;
                state.isInitial = true;
            }
        }

        io.to(roomCode).emit('game-sync', room);
    });

    socket.on('disconnect', () => {
        // ניקוי חדרים ריקים במידת הצורך
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));