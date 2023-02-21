import "./util/MonkeyPatch";
import db from "./db";
import type { ExtendedWebsite } from "@lib/Website";
import { readdirSync } from "fs";
import type { Server as HTTPServer } from "http";
import type { Server as HTTPSServer } from "https";

const sites = readdirSync(`${__dirname}/sites`).map(s => s.toLowerCase());

const activeSite = process.env.SITE || null;
if (!activeSite) {
	console.error("missing SITE environment variable.");
	process.exit(1);
}

if (!sites.includes(activeSite.toLowerCase())) {
	console.error("Invalid value \"%s\" in SITE environment variable.", activeSite);
	process.exit(1);
}

let server: HTTPSServer | HTTPServer | undefined;
void db.init().then(() => {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const site = require(`${__dirname}/sites/${activeSite}/index.js`) as Record<"default", ExtendedWebsite>;

	server = (new site.default()).listen();
});
process
	.on("uncaughtException", (err, origin) => console.error("Uncaught Exception", origin, err))
	.on("unhandledRejection", (reason, promise) => console.error("Unhandled Rejection", reason, promise))
	.on("SIGINT", () => server?.close(() => process.exit(0)))
	.on("SIGTERM", () => server?.close(() => process.exit(0)));

process.stdin.on("data", (d) => {
	if (d.toString() === "exit\n") process.kill(process.pid, 9);
});
