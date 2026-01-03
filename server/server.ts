import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";

const app = express();
app.use(cors()); // allow your React app to talk to it
app.use(express.json({ limit: "5mb" })); // allow large payloads

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Path inside container / shared folder
const OUT_FILE = path.resolve(__dirname, "../shared/default.scm");

app.post("/spanner-file", (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).send("No content provided");

    fs.writeFileSync(OUT_FILE, content, "utf-8");
    console.log("[server] Written spanner-out.scm");
    res.send({ status: "ok" });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`[server] Listening on port ${PORT}`));
