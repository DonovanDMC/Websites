import { getIP } from "../util/general";
import { logsDir } from "@config";
import morgan from "morgan";
import { colors, styles } from "leeks.js";
import * as rfs from "rotating-file-stream";
import type express from "express";
import type { ServerResponse } from "http";
import { mkdirSync } from "fs";
mkdirSync(logsDir, { recursive: true });
const stream = rfs.createStream("access.log", {
	interval: "1d", // rotate daily
	path:     logsDir
});

morgan
	.token("hostname", (req: express.Request) => req.hostname)
	.token("method", (req: express.Request) => {
		if (!req) return "UNKNOWN";
		switch (req.method.toUpperCase()) {
			case "GET":
			case "HEAD":
			case "TRACE":
			case "OPTIONS":
			case "CONNECT":
				return colors.green(req.method.toUpperCase());
				break;

			case "POST":
			case "PUT":
				return colors.blue(req.method.toUpperCase());
				break;

			case "DELETE":
				return colors.red(req.method.toUpperCase());
				break;

			default:
				return req.method.toUpperCase();
		}
	})
	.token("url", (req: express.Request) => {
		if (!req) return "UNKNOWN";
		switch (req.method.toUpperCase()) {
			case "GET":
			case "HEAD":
			case "TRACE":
			case "OPTIONS":
			case "CONNECT":
				return colors.green(req.originalUrl);
				break;

			case "POST":
			case "PUT":
				return colors.blue(req.originalUrl);
				break;

			case "DELETE":
				return colors.red(req.originalUrl);
				break;

			default:
				return req.originalUrl;
		}
	})
	.token("status", (req: express.Request, res: ServerResponse) => {
		if (!res) return "Unknown";
		if (res.statusCode >= 500) return colors.red(`${res.statusCode} ${res.statusMessage}`);
		else if (res.statusCode >= 400) return colors.yellow(`${res.statusCode} ${res.statusMessage}`);
		else if (res.statusCode >= 300) return colors.cyan(`${res.statusCode} ${res.statusMessage}`);
		else if (res.statusCode >= 200) return colors.green(`${res.statusCode} ${res.statusMessage}`);
		else return String(res.statusCode);
	})
	.token("ip", (req: express.Request) => {
		if (!req) return "UNKNOWN";
		const ip = getIP(req);
		if (!ip) return "UNKNOWN";
		if (ip.includes("127.0.0.1") || ip.includes("::1")) return `${colors.blue(styles.bold("[LOCAL]"))} ${colors.cyan(String(ip))}`;
		else return colors.cyan(String(ip));
	})
	.token("hostnamenc", (req: express.Request) => req.hostname)
	.token("methodnc", (req: express.Request) => req.method.toUpperCase())
	.token("urlnc", (req: express.Request) => req.originalUrl)
	.token("statusnc", (req: express.Request, res: ServerResponse) => res.statusCode.toString())
	.token("ipnc", (req: express.Request) => {
		if (!req) return "UNKNOWN";
		const ip = getIP(req);
		if (!ip) return "UNKNOWN";
		if (ip.includes("127.0.0.1") || ip.includes("::1")) return `[LOCAL] ${ip}`;
		else return ip;
	})
	.token("dt", () => new Date().toString().split(" ").slice(1, 5).join(" "))
	.token("auth", (req: express.Request) => req.query._auth ? "[QAUTH]" : req.headers.authorization ? "[AUTH]:" : ":")
	.token("ua", (req: express.Request) => req.query._ua as string || req.headers["user-agent"] || "NONE");

export const fileLogger = morgan("[:dt]:auth :hostnamenc - :ipnc || HTTP/:http-version :methodnc :urlnc :statusnc :response-time ms - :res[content-length] - :user-agent", {
	stream
});
export const consoleLogger = morgan(`[:dt]:auth :hostname - :ip || HTTP/:http-version :method :url :status :response-time ms - ${colors.blue(":res[content-length]")}`);
