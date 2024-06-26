import { getStats } from "./api_v2";
import CleanupActions from "../../../util/CleanupActions";
import db from "../../../db";
import { READONLY, cacheDir, dev, discord } from "@config";
import { APIKey, DEFAULT_FLAGS } from "@models";
import Webhooks from "@util/Webhooks";
import { ApplicationCommandBuilder, ButtonColors, ComponentBuilder, EmbedBuilder } from "@oceanicjs/builders";
import type { ModalActionRow, MessageActionRow, CreateApplicationCommandOptions } from "oceanic.js";
import {
	ApplicationCommandTypes,
	ApplicationCommandOptionTypes,
	TextInputStyles,
	Client,
	InteractionTypes,
	MessageFlags
} from "oceanic.js";
import FuzzySearch from "fuzzy-search";
import { createHash } from "crypto";
import { access, readFile, writeFile } from "fs/promises";

const greenTick = "<:greenTick:865401802920951819>";
const redTick = "<:redTick:865401803256627221>";

const client = new Client({
	auth:    `Bot ${discord["yiffy-bot"].token}`,
	gateway: {
		intents: 0
	}
});

client.once("ready", async() => {
	console.log("Ready as", client.user.tag);
	const commands = [
		new ApplicationCommandBuilder(ApplicationCommandTypes.CHAT_INPUT, "apikey")
			.setDescription("Manage your API keys")
			.addOption("create", ApplicationCommandOptionTypes.SUB_COMMAND, (sub) => {
				sub.setDescription("Create an API key");
			})
			.addOption("delete", ApplicationCommandOptionTypes.SUB_COMMAND, (sub) => {
				sub.setDescription("Delete an API key")
					.addOption("key", ApplicationCommandOptionTypes.STRING, (option) => {
						option
							.setDescription("The API key to delete")
							.setAutocomplete();
					});
			})
			.addOption("list", ApplicationCommandOptionTypes.SUB_COMMAND, (sub) => {
				sub.setDescription("List your API keys");
			})
			.toJSON(),
		new ApplicationCommandBuilder(ApplicationCommandTypes.CHAT_INPUT, "apidev")
			.setDescription("Manage API keys (developer only)")
			.addOption("list", ApplicationCommandOptionTypes.SUB_COMMAND, (sub) => {
				sub.setDescription("List a user's api keys.")
					.addOption("user", ApplicationCommandOptionTypes.USER, (option) => {
						option.setDescription("The user to list the api keys of.")
							.setRequired();
					});
			})
			.addOption("disable", ApplicationCommandOptionTypes.SUB_COMMAND, (sub) => {
				sub.setDescription("Disable an api key.")
					.addOption("key", ApplicationCommandOptionTypes.STRING, (option) => {
						option.setDescription("The api key to disable.")
							.setRequired();
					})
					.addOption("reason", ApplicationCommandOptionTypes.STRING, (option) => {
						option.setDescription("The reason for deactivating the key.");
					});
			})
			.addOption("enable", ApplicationCommandOptionTypes.SUB_COMMAND, (sub) => {
				sub.setDescription("Enable an api key.")
					.addOption("key", ApplicationCommandOptionTypes.STRING, (option) => {
						option.setDescription("The api key to enable.")
							.setRequired();
					});
			})
			.addOption("stats", ApplicationCommandOptionTypes.SUB_COMMAND, (sub) => {
				sub.setDescription("Get the stats of an api key.")
					.addOption("key", ApplicationCommandOptionTypes.STRING, (option) => {
						option.setDescription("The api key to get the stats of.")
							.setRequired();
					});
			})
			.toJSON()
	];
	let cache: Array<CreateApplicationCommandOptions> = [];
	if (await access(`${cacheDir}/commands.json`).then(() => true, () => false)) {
		cache = JSON.parse(await readFile(`${cacheDir}/commands.json`, "utf8")) as Array<CreateApplicationCommandOptions>;
	}

	if (JSON.stringify(cache) !== JSON.stringify(commands)) {
		await client.application.bulkEditGlobalCommands(commands);
		await writeFile(`${cacheDir}/commands.json`, JSON.stringify(commands));
	}
});
client.on("debug", (info) => console.debug("YiffAPI Bot Debug", info));
client.on("interactionCreate", async(interaction) => {
	switch (interaction.type) {
		case InteractionTypes.APPLICATION_COMMAND: {
			if (interaction.guildID === null) return interaction.createMessage({
				content: "My commands cannot be used in Direct Messages.",
				flags:   MessageFlags.EPHEMERAL
			});

			switch (interaction.data.name) {
				case "apikey": {
					const [subcommand] = interaction.data.options.getSubCommand<["create" | "delete" | "list"]>(true);
					switch (subcommand) {
						case "create": {
							if (READONLY) {
								return interaction.createMessage({
									flags:   MessageFlags.EPHEMERAL,
									content: "We're currently in read-only mode. Try again later."
								});
							}
							const keyCount = await APIKey.getOwned(interaction.user.id);
							if (keyCount.length >= 3) return interaction.createMessage({
								flags:   MessageFlags.EPHEMERAL,
								content: "You already have the maximum amount of api keys. Contact a developer if you believe an exception should be made.."
							});
							return interaction.createModal({
								customID: "apikey-create",
								components:
									new ComponentBuilder<ModalActionRow>()
										.addTextInput({
											customID:    "apikey-create.name",
											placeholder: "My Awesome Application",
											minLength:   3,
											maxLength:   50,
											label:       "Name",
											style:       TextInputStyles.SHORT
										})
										.addTextInput({
											customID:    "apikey-create.contact",
											placeholder: "You can contact me at my@amazing.email",
											minLength:   5,
											maxLength:   400,
											label:       "Contact",
											style:       TextInputStyles.PARAGRAPH
										})
										.toJSON(),
								title: "Create API Key"
							});
						}

						case "delete": {
							if (READONLY) {
								return interaction.createMessage({
									flags:   MessageFlags.EPHEMERAL,
									content: "We're currently in read-only mode. Try again later."
								});
							}

							const key = (await APIKey.getOwned(interaction.user.id)).find(k => createHash("md5").update(k.id).digest("hex") === interaction.data.options.getString("key", true));
							if (!key || key.owner !== interaction.user.id) return interaction.createMessage({
								content: "Invalid key specified.",
								flags:   MessageFlags.EPHEMERAL
							});

							if (key.disabled) return interaction.createMessage({
								content: `This key has been disabled by a developer. To have this key deleted or removed, concat a developer.\n\nDisable Reason: **${key.disabledReason ?? "(None)"}**`,
								flags:   MessageFlags.EPHEMERAL
							});

							return interaction.createMessage({
								content:    `Are you sure you want to delete the key **${key.application}**? This action cannot be undone.`,
								flags:      MessageFlags.EPHEMERAL,
								components: new ComponentBuilder<MessageActionRow>()
									.addInteractionButton({
										// it IS ephemeral, but we still hash the key just in case (the key itself is the only unique id we have)
										customID: `apikey-delete-yes.${createHash("md5").update(key.id).digest("hex")}.${interaction.user.id}`,
										label:    "Yes",
										style:    ButtonColors.GREEN
									})
									.addInteractionButton({
										customID: `apikey-delete-no.${interaction.user.id}`,
										label:    "No",
										style:    ButtonColors.RED
									})
									.toJSON()
							});
							break;
						}

						case "list": {
							const keys = await APIKey.getOwned(interaction.user.id);

							if (keys.length === 0) return interaction.createMessage({
								content: "You do not have any API keys.",
								flags:   MessageFlags.EPHEMERAL
							});

							return interaction.createMessage({
								content: `We found the following api keys:\n\n${keys.map((k, i) => [
									`${i + 1}.)`,
									`- Key: ||${k.id}||`,
									`- Application: \`${k.application}\``,
									`- Contact: \`${k.contact || "NONE"}\``,
									`- Active: ${k.active ? greenTick : redTick}`,
									`- Disabled: ${k.disabled ? `${greenTick} (Reason: ${k.disabledReason ?? "NONE"})` : redTick}`,
									`- Unlimited: ${k.unlimited ? greenTick : redTick}`,
									`- Services: ${k.servicesString}`,
									`- SFW Only: ${k.sfwOnly ? greenTick : redTick}`
								].join("\n")).join("\n\n")}`,
								flags: MessageFlags.EPHEMERAL
							});
						}
					}
					break;
				}

				case "apidev": {
					const [subcommand] = interaction.data.options.getSubCommand<["list" | "disable" | "enable" | "stats"]>(true);
					if (!discord["yiffy-bot"].dev.includes(interaction.user.id)) {
						return interaction.createMessage({
							content: "You are not allowed to use that.",
							flags:   MessageFlags.EPHEMERAL
						});
					}
					switch (subcommand) {
						case "list": {
							const user = interaction.data.options.getUser("user", true);
							const keys = await APIKey.getOwned(user.id);

							if (keys.length === 0) return interaction.createMessage({
								content: "That user does not have any API keys.",
								flags:   MessageFlags.EPHEMERAL
							});

							return interaction.createMessage({
								content: `We found the following api keys for <@${user.id}>:\n\n${keys.map((k, i) => [
									`${i + 1}.)`,
									`- Key: ||${k.id}||`,
									`- Application: \`${k.application}\``,
									`- Contact: \`${k.contact || "NONE"}\``,
									`- Active: ${k.active ? greenTick : redTick}`,
									`- Disabled: ${k.disabled ? `${greenTick} (Reason: ${k.disabledReason ?? "NONE"})` : redTick}`,
									`- Unlimited: ${k.unlimited ? greenTick : redTick}`,
									`- Services: ${k.servicesString}`,
									`- SFW Only: ${k.sfwOnly ? greenTick : redTick}`
								].join("\n")).join("\n\n")}`,
								flags:           MessageFlags.EPHEMERAL,
								allowedMentions: {
									users: false
								}
							});
							break;
						}

						case "disable": {
							const key = interaction.data.options.getString("key", true);
							const reason = interaction.data.options.getString("reason") || "None Provided";
							const apikey = await APIKey.get(key);
							if (apikey === null) {
								return interaction.createMessage({
									content: "I couldn't find that api key.",
									flags:   MessageFlags.EPHEMERAL
								});
							}

							if (apikey.disabled) {
								return interaction.createMessage({
									content: "That api key is already disabled.",
									flags:   MessageFlags.EPHEMERAL
								});
							}

							await db.query("UPDATE yiffy2.api_keys SET disabled = ?, disabled_reason = ? WHERE id = ?", [true, reason, key]);

							return interaction.createMessage({
								content: "Api key successfully disabled.",
								flags:   MessageFlags.EPHEMERAL
							});
							break;
						}

						case "enable": {
							const key = interaction.data.options.getString("key", true);
							const apikey = await APIKey.get(key);
							if (apikey === null) {
								return interaction.createMessage({
									content: "I couldn't find that api key.",
									flags:   MessageFlags.EPHEMERAL
								});
							}

							if (!apikey.disabled) {
								return interaction.createMessage({
									content: "That api key is not disabled.",
									flags:   MessageFlags.EPHEMERAL
								});
							}

							await db.query("UPDATE yiffy2.api_keys SET disabled = ?, disabled_reason = ? WHERE id = ?", [false, null, key]);

							return interaction.createMessage({
								content: "Api key successfully enabled.",
								flags:   MessageFlags.EPHEMERAL
							});
							break;
						}

						case "stats": {
							const key = interaction.data.options.getString("key", true);
							const apikey = await APIKey.get(key);
							if (apikey === null) {
								return interaction.createMessage({
									content: "I couldn't find that api key.",
									flags:   MessageFlags.EPHEMERAL
								});
							}

							const { root: { key: stats } } = await getStats(undefined, key);
							let text = `Stats for **${apikey.application}** (||${key}||)\n`;
							for (const [name, value] of Object.entries(stats!)) {
								text += `**${name}**: ${value.toLocaleString()}\n`;
							}

							return interaction.createMessage({
								content: text,
								flags:   MessageFlags.EPHEMERAL
							});
							break;
						}
					}
					break;
				}
			}
			break;
		}

		case InteractionTypes.MESSAGE_COMPONENT: {
			const id = interaction.data.customID.split(".").slice(-1)[0];
			if (interaction.user.id !== id) return interaction.createMessage({
				content: "That is not yours to play with."
			});
			switch (interaction.data.customID.split(".")[0]) {
				case "apikey-delete-yes": {
					if (READONLY) {
						return interaction.createMessage({
							flags:   MessageFlags.EPHEMERAL,
							content: "We're currently in read-only mode. Try again later."
						});
					}
					const key = (await APIKey.getOwned(interaction.user.id)).find(k => createHash("md5").update(k.id).digest("hex") === interaction.data.customID.split(".")[1]);
					if (!key) return interaction.createMessage({
						content: "Invalid key specified.",
						flags:   MessageFlags.EPHEMERAL
					});
					await key.delete();
					void Webhooks.get("yiffyAPIKey").execute({
						embeds: [
							new EmbedBuilder()
								.setTitle("API Key Deleted")
								.setDescription([
									`Key: \`${key.id}\``,
									`Application: **${key.application}**`,
									`Contact: ${key.contact || "NONE"}`,
									`Active: ${key.active ? greenTick : redTick}`,
									`Disabled: ${key.disabled ? `${greenTick} (Reason: ${key.disabledReason ?? "NONE"})` : redTick}`,
									`Unlimited: ${key.unlimited ? greenTick : redTick}`,
									`Services: ${key.servicesString}`,
									`SFW Only: ${key.sfwOnly ? greenTick : redTick}`
								])
								.setColor(0xDC143C)
								.setTimestamp(new Date().toISOString())
								.setAuthor(interaction.user.tag, interaction.user.avatarURL())
								.toJSONRaw()
						]
					});
					return interaction.editParent({
						content: "Key deleted.",
						flags:   MessageFlags.EPHEMERAL
					});
					break;
				}

				case "apikey-delete-no": {
					return interaction.createMessage({
						content: "Cancelled.",
						flags:   MessageFlags.EPHEMERAL
					});
					break;
				}
			}
			break;
		}

		case InteractionTypes.APPLICATION_COMMAND_AUTOCOMPLETE: {
			switch (interaction.data.name) {
				case "apikey": {
					const [subcommand] = interaction.data.options.getSubCommand<["delete"]>(true);
					switch (subcommand) {
						case "delete": {
							const keys = await APIKey.getOwned(interaction.user.id);
							const search = new FuzzySearch(keys.map(k => ({
								name:  k.application,
								value: createHash("md5").update(k.id).digest("hex")
							})), ["name"]);
							return interaction.result(search.search(interaction.data.options.getString("key", true)));
							break;
						}
					}
					break;
				}
			}
			break;
		}

		case InteractionTypes.MODAL_SUBMIT: {
			switch (interaction.data.customID) {
				case "apikey-create": {
					if (READONLY) {
						return interaction.createMessage({
							flags:   MessageFlags.EPHEMERAL,
							content: "We're currently in read-only mode. Try again later."
						});
					}
					const name = interaction.data.components[0].components[0].value!;
					const contact = interaction.data.components[1].components[0].value!;
					if (name.length < 3 || name.length > 50) return interaction.createMessage({
						content: "Name must be between 3 and 5 characters.",
						flags:   MessageFlags.EPHEMERAL
					});
					if (contact.length < 5 || contact.length > 400) return interaction.createMessage({
						content: "Contact must be between 5 and 400 characters.",
						flags:   MessageFlags.EPHEMERAL
					});

					const key = await APIKey.new({
						unlimited:       false,
						owner:           interaction.user.id,
						application:     name,
						contact,
						disabled:        false,
						disabled_reason: null,
						active:          true,
						flags:           DEFAULT_FLAGS,
						bulk_limit:      100
					});
					if (!key) {
						return interaction.createMessage({
							content: "An error occurred while creating your API key.",
							flags:   MessageFlags.EPHEMERAL
						});
					}

					void Webhooks.get("yiffyAPIKey").execute({
						embeds: [
							new EmbedBuilder()
								.setTitle("API Key Created")
								.setDescription([
									`Key: \`${key.id}\``,
									`Application: **${key.application}**`,
									`Contact: ${key.contact}`,
									`Active: ${key.active ? greenTick : redTick}`,
									`Disabled: ${key.disabled ? `${greenTick} (Reason: ${key.disabledReason ?? "NONE"})` : redTick}`,
									`Unlimited: ${key.unlimited ? greenTick : redTick}`,
									`Services: ${key.servicesString}`
								])
								.setColor(0x008000)
								.setTimestamp(new Date().toISOString())
								.setAuthor(interaction.user.tag, interaction.user.avatarURL())
								.toJSONRaw()
						]
					});
					return interaction.createMessage({
						content: `Your API key: \`${key.id}\`. Provide this in the \`Authorization\` header. You must still provide a unique user agent. If you have any issues, contact a developer.`,
						flags:   MessageFlags.EPHEMERAL
					});
				}
			}
			break;
		}
	}
});

if (!dev) {
	void client.connect();
	CleanupActions.add("yiffyapi-bot", () => client.disconnect(false));
}
