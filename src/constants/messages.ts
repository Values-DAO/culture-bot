import type mongoose from "mongoose";

const urlPart = process.env.ENV === 'prod' ? 'app' : 'staging';

export const WELCOME_MESSAGE = `
🌟 *Culture Bot* 🚀

I'm here to identify value-aligned content and post your community's lore/culture onchain in your Culture Book! 

🛠️ To get started, use  \`/trustpool <link>\`  to link your Community to a Trust Pool. Get the link from [ValuesDAO](https://${urlPart}.valuesdao.io/trustpools).
   
I will summarise the most value-aligned content every Friday and post it onchain, tag members who are creating cultural content here.

You can also tag me in a message to add it to your Culture Book.

Preserve your culture with Culture Bot!  🌍🔗
`;

export const COMMANDS_MESSAGE = `
📚 *Culture Bot Commands* 🤖
- \`/trustpool <link>\` : Link your Community to a Trust Pool.
`;

export const POLL_MESSAGE = `
🚨 A new message has been tagged for evaluation. Please vote in the poll below to decide if it aligns with our community's values. \n\n⏳ The poll is open for the next 24 hours, so don’t miss your chance to contribute. \n\nThe majority vote will determine if it gets added onchain. Let’s preserve our culture together!
`;

export const WALLET_EXPORT_MESSAGE = (telegramUsername: string, publicKey: string, decryptedPrivateKey: string) => {
  return `
🔐 *Wallet Export for ${telegramUsername}*

💼 *Public Address:* \`${publicKey}\`

🔑 *Private Key:* \`${decryptedPrivateKey}\`

⚠️ *IMPORTANT:*
- Keep this private key secure
- Never share it with anyone
- Store it safely offline
- Delete this message after saving the key
`
};

export const WALLET_DETAILS_MESSAGE = (publicKey: string, balanceInEth: string, tokensMessage: string) => {
  return `
💳 Your Wallet's Public Key: \`${publicKey}\`

💰 Balance: ${balanceInEth} ETH

💸 Tokens:
${tokensMessage}
  `;
};

export const NO_CONTRIBUTORS_MESSAGE = `
🌟 Culture Book Update 📚

Hey everyone! Seems like this community has been quiet this week. No top contributors found. 🤷‍♂️

Try sharing some value-aligned content next week to preserve your culture onchain for generations to come!

📝 You can tag me in a message to add it to your Culture Book.
`;

export const CONTRIBUTORS_MESSAGE = (trustPoolId: string, contributorSection: any) => {
  return `
🌟 Culture Book Update 📚

Hey everyone! This week's Culture Book is ready.

👉 Check it out here: [Culture Book](https://${urlPart}.valuesdao.io/trustpools/${trustPoolId}/culture)

📝 Top Contributors this week:

${contributorSection}

Tip: You can also tag me in a message to add it to your Culture Book.
`;
}

export const APPROVED_MESSAGE = (trustPoolId: mongoose.Schema.Types.ObjectId) => {
  return `
🎉 The community has spoken! This message has been deemed value-aligned and is now immortalized onchain. Thanks for keeping our culture alive! Check it out on the [Culture Book](https://app.valuesdao.io/trustpools/${trustPoolId}/culture) ✨
`;
}

export const REJECTED_MESSAGE = `
❌ The community has decided this message doesn’t align with our values. Keep sharing, and let’s continue building our story together!
`;