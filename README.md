# Taako's Equicord Plugins

## Plugins

### PrettyChannelNames

Makes visible text channel names easier to read by replacing hyphens with spaces and applying configurable capitalization.

### LocalChannelAliases

Lets you privately rename channels from their context menu. Aliases are stored locally and do not change the server.

### SlowmodeAssistant

Shows a live slowmode countdown beside the message composer.

### ChannelScratchpad

Adds private per-channel notes, links, and optional reminder notifications.

## Install

1. Clone this repo into `Equicord/src/userplugins`
2. Run `pnpm build` from the Equicord root
3. Restart Discord
4. Enable the plugins you want in Equicord's plugin settings

## Usage

- Right-click a channel and choose **Set Local Channel Alias** to rename it only for yourself.
- `SlowmodeAssistant` appears automatically beside the message composer while slowmode applies.
- Open `ChannelScratchpad` from the channel toolbar or a channel's right-click menu.

## PrettyChannelNames Settings

- Replace hyphens with spaces
- Capitalize the first letter of each word
- Display channel names in all caps
- Keep user-specified acronyms uppercase using a comma- or space-separated list
