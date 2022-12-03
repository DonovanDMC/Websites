import db from "@db";
import type { DataTypes } from "@uwu-codes/types";
import type { Request } from "express";
import type { UpsertResult } from "mariadb";

export interface RawAPIUsage {
	id: bigint;
	key: string | null;
	ip: string;
	user_agent: string;
	method: string;
	path: string;
	timestamp: string;
}
export type APIUsageKV = DataTypes<APIUsage>;
export { APIUsage };
export default class APIUsage {
	static DB = "yiffyapi2";
	static TABLE = "usage";
	id: bigint;
	key: string | null;
	ip: string;
	userAgent: string;
	method: string;
	path: string;
	timestamp: string;
	constructor(data: RawAPIUsage) {
		this.id = data.id;
		this.key = data.key;
		this.ip = data.ip;
		this.userAgent = data.user_agent;
		this.method = data.method;
		this.path = data.path;
		this.timestamp = data.timestamp;
	}

	static async track(req: Request, service: string) {
		const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip).toString();
		const auth = req.query._auth as string || req.headers.authorization || null;
		const res = await db.query(`INSERT INTO ${APIUsage.DB}.${APIUsage.TABLE} (\`key\`, ip, user_agent, method, path, referrer, query, service) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
			auth,
			ip,
			req.query._ua || req.headers["user-agent"] || null,
			req.method.toUpperCase(),
			req.originalUrl.split("?")[0],
			req.headers.referer || null,
			JSON.stringify(req.query),
			service
		]) as UpsertResult;
		const multi = db.r.multi()
			.incr(`yiffy2:ip:${ip}`)
			.incr(`yiffy2:${service}:ip:${ip}`);
		if (auth) {
			multi.incr(`yiffy2:key:${auth}`)
				.incr(`yiffy2:${service}:key:${auth}`);
		}
		await multi.exec();
		return res.insertId;
	}
}
