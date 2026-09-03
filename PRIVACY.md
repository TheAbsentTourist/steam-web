# Privacy policy

**steam-web** is an unofficial third-party plugin. It is not affiliated with, endorsed, or sponsored by Valve Corporation or Steam.

## What this plugin does

The plugin runs on the installer’s machine. It has no backend operated by the plugin author. When you use a keyed tool, it sends HTTP requests from your machine to Valve’s Steam Web API (`https://api.steampowered.com`). Store app details (`steam_get_app_details`) are a keyless GET to `https://store.steampowered.com/api/appdetails` — the Web API key is never sent to that host.

## Credentials

- You supply your own Steam Web API key (and optionally a SteamID64).
- Those values stay in your local environment, Cursor/Grok Bot Configure store, or `$PLUGIN_DATA/config.json`.
- They are not sent to the plugin author and must not be committed to git.
- Keep your key confidential, as required by the [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms).

## Data

- The plugin only requests Steam data when you (or your agent, on your instruction) call a tool.
- It does not sell data.
- It does not use Steam data or chat content to train models.
- Private or friends-only Steam profiles may return empty or `private_or_unavailable`.
- Valve’s documented cap is 100,000 Web API calls per day.

Steam data Valve holds is also covered by [Valve’s privacy policy](https://www.valvesoftware.com/privacy.htm).

## Contact

Contact: chucktastictime@gmail.com

Issues: https://github.com/TheAbsentTourist/steam-web/issues
