import docsRoute from "./routes/docs";
import Website from "@lib/Website";
import express, { Router } from "express";

export default class FurryCool extends Website {
	constructor() {
		super("oceanic.ws", __dirname);
		this
			.setSecure(true)
			.setPort(443)
			.disableNonce()
			.init();

		this
			.addSubdomain("docs", Router().use(docsRoute))
			.addSubdomain("i", express.static("/app/public/images"))
			.addHandler(
				express.Router()
					.get("/", async(req, res) => res.render("index"))
			);
	}
}
