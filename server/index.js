 const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

let documents = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-document", (docId) => {
    socket.join(docId);

    if (!documents[docId]) {
      documents[docId] = "";
    }

    socket.emit("load-document", documents[docId]);

    socket.on("send-changes", (delta) => {
      socket.to(docId).emit("receive-changes", delta);
    });

    socket.on("save-document", (data) => {
      documents[docId] = data;
    });
  });
});

server.listen(3001, () => {
  console.log("Server running on port 3001");
});
