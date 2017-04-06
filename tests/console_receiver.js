const net = require("net");

const tcpServer = new net.Server();
const tcpClients = new Set();

const flags = new Set();

tcpServer.on("connection", (socket) => {
    console.log(`TCP: ${socket.remoteAddress}:${socket.remotePort} connected`);
    tcpClients.add(socket);
    socket.write("Enter your flags, finished with newline (or empty line to exit)\n");

    let inputBuffer = "";

    socket.on("data", (data) => {

        data = inputBuffer + data.toString();

        let lines = data.split("\n");
        const last = lines.pop();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let answers;
            if (!flags.has(line)) {
                flags.add(line);
                answer = "Accepted";
            } else {
                answer = "Duplicate";
            }

            console.log(`TCP: Flag from ${socket.remoteAddress}: ${line} = ${answer}. Total: ${flags.size}`);
            socket.write(answer + "\n");
        }


        if (last.length > 0) {
            inputBuffer = last;
        } else {
            inputBuffer = "";
        }
    });

    socket.on("error", (error) => {
        console.log(`TCP: Error with ${socket.remoteAddress} socket:\n`, error);
    });

    socket.on("close", () => {
        tcpClients.delete(socket);
        console.log(`TCP: ${socket.remoteAddress} disconnected`);
    });
});

tcpServer.listen({
    host: "0.0.0.0",
    port: 31337,
}, (error) => {
    if (error) {
        throw error;
    } else {
        let addr = tcpServer.address();
        console.log(`TCP: Start listening on ${addr.address} ${addr.port}`);
    }
});
