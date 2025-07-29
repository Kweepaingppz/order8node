
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const token = process.env.BOT_TOKEN;

if (!token) {
    console.error('Bot token not found in environment variables.');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Dummy product data with image paths
const PRODUCTS = {
    "p1": {
        "name": "Dummy Product A",
        "price": 10.00,
        "description": "A great dummy product.",
        "category": "Electronics",
        "image": "/home/ubuntu/dummy_telegram_bot/dummy_images/product_a.png",
    },
    "p2": {
        "name": "Dummy Product B",
        "price": 25.50,
        "description": "Another fantastic dummy product.",
        "category": "Books",
        "image": "/home/ubuntu/dummy_telegram_bot/dummy_images/product_b.png",
    },
    "p3": {
        "name": "Dummy Product C",
        "price": 5.00,
        "description": "Small and useful dummy product.",
        "category": "Home Goods",
        "image": "/home/ubuntu/dummy_telegram_bot/dummy_images/product_c.jpg",
    },
};

// User carts and product index for carousel
const userCarts = {};
const userProductIndex = {};

// States for conversation flow (simplified for Node.js, using context for state)
const CONVERSATION_STATE = {
    NONE: 0,
    PHONE_NUMBER: 1,
    SHIPPING_ADDRESS: 2,
    CONFIRM_ORDER: 3,
};

const userConversationState = {};
const userConversationData = {};

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    userConversationState[chatId] = CONVERSATION_STATE.NONE;
    userConversationData[chatId] = {};

    const keyboard = [
        [{ text: "View Products", callback_data: "view_products" }],
        [{ text: "View Cart", callback_data: "view_cart" }],
        [{ text: "Checkout", callback_data: "checkout" }],
    ];
    const replyMarkup = { inline_keyboard: keyboard };

    await bot.sendMessage(chatId, "Welcome to the Dummy Store! Please choose an option:", { reply_markup: replyMarkup });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;
    const userId = query.from.id;

    await bot.answerCallbackQuery(query.id);

    if (data === 'view_products') {
        userProductIndex[userId] = 0; // Start at the first product
        await displayProduct(chatId, messageId, userId, 0);
    } else if (data.startsWith('next_product_') || data.startsWith('prev_product_')) {
        let currentIndex = userProductIndex[userId] || 0;
        const productIds = Object.keys(PRODUCTS);
        const maxIndex = productIds.length - 1;

        let newIndex;
        if (data.startsWith('next_product_')) {
            newIndex = Math.min(currentIndex + 1, maxIndex);
        } else {
            newIndex = Math.max(0, currentIndex - 1);
        }
        userProductIndex[userId] = newIndex;
        await displayProduct(chatId, messageId, userId, newIndex);
    } else if (data.startsWith('add_to_cart_')) {
        const productId = data.replace('add_to_cart_', '');
        if (!PRODUCTS[productId]) {
            await bot.sendMessage(chatId, 'Invalid product selected.');
            return;
        }

        if (!userCarts[userId]) {
            userCarts[userId] = {};
        }
        userCarts[userId][productId] = (userCarts[userId][productId] || 0) + 1;

        const productName = PRODUCTS[productId].name;
        const cartCount = Object.values(userCarts[userId]).reduce((sum, qty) => sum + qty, 0);

        const keyboard = [
            [{ text: "View Cart", callback_data: "view_cart" }],
            [{ text: "Continue Shopping", callback_data: "view_products" }],
            [{ text: "Back to Main Menu", callback_data: "main_menu" }],
        ];
        const replyMarkup = { inline_keyboard: keyboard };

        await bot.sendMessage(chatId, `${productName} added to your cart!\n\nCurrent cart: ${cartCount} items.`, { reply_markup: replyMarkup });
    } else if (data === 'view_cart') {
        const cart = userCarts[userId] || {};

        if (Object.keys(cart).length === 0) {
            const keyboard = [
                [{ text: "View Products", callback_data: "view_products" }],
                [{ text: "Back to Main Menu", callback_data: "main_menu" }],
            ];
            const replyMarkup = { inline_keyboard: keyboard };
            await bot.sendMessage(chatId, 'Your cart is empty!', { reply_markup: replyMarkup });
            return;
        }

        let cartText = "Your Cart:\n\n";
        let totalPrice = 0.0;
        const keyboard = [];

        for (const productId in cart) {
            const quantity = cart[productId];
            const productInfo = PRODUCTS[productId];
            const name = productInfo.name;
            const price = productInfo.price;
            const itemPrice = price * quantity;
            cartText += `- ${name} (x${quantity}) - $${itemPrice.toFixed(2)}\n`;
            totalPrice += itemPrice;
            keyboard.push([
                { text: `Remove ${name}`, callback_data: `remove_from_cart_${productId}` }
            ]);
        }

        cartText += `\nTotal: $${totalPrice.toFixed(2)}`;
        keyboard.push([{ text: "Checkout", callback_data: "checkout" }]);
        keyboard.push([{ text: "Continue Shopping", callback_data: "view_products" }]);
        keyboard.push([{ text: "Back to Main Menu", callback_data: "main_menu" }]);

        const replyMarkup = { inline_keyboard: keyboard };
        await bot.sendMessage(chatId, cartText, { reply_markup: replyMarkup });
    } else if (data.startsWith('remove_from_cart_')) {
        const productId = data.replace('remove_from_cart_', '');

        if (userCarts[userId] && userCarts[userId][productId]) {
            const productName = PRODUCTS[productId].name;
            delete userCarts[userId][productId];
            const keyboard = [
                [{ text: "View Cart", callback_data: "view_cart" }],
                [{ text: "Continue Shopping", callback_data: "view_products" }],
                [{ text: "Back to Main Menu", callback_data: "main_menu" }],
            ];
            const replyMarkup = { inline_keyboard: keyboard };
            await bot.sendMessage(chatId, `${productName} removed from your cart.`, { reply_markup: replyMarkup });
        } else {
            const keyboard = [
                [{ text: "View Cart", callback_data: "view_cart" }],
                [{ text: "Back to Main Menu", callback_data: "main_menu" }],
            ];
            const replyMarkup = { inline_keyboard: keyboard };
            await bot.sendMessage(chatId, 'Item not found in cart.', { reply_markup: replyMarkup });
        }
    } else if (data === 'checkout') {
        const cart = userCarts[userId] || {};
        if (Object.keys(cart).length === 0) {
            const keyboard = [
                [{ text: "View Products", callback_data: "view_products" }],
                [{ text: "Back to Main Menu", callback_data: "main_menu" }],
            ];
            const replyMarkup = { inline_keyboard: keyboard };
            await bot.sendMessage(chatId, 'Your cart is empty! Cannot checkout.', { reply_markup: replyMarkup });
            return;
        }
        userConversationData[chatId].cart = cart;
        userConversationState[chatId] = CONVERSATION_STATE.PHONE_NUMBER;
        await bot.sendMessage(chatId, 'Please provide your phone number for the order.');
    } else if (data === 'confirm_order' || data === 'cancel_order') {
        if (data === 'confirm_order' && userConversationData[chatId].cart) {
            delete userCarts[userId]; // Clear the cart
            userConversationData[chatId] = {}; // Clear temporary order data
            await bot.editMessageText(
                "Thank you for your order! Your order has been placed successfully.",
                { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "Back to Main Menu", callback_data: "main_menu" }]] } }
            );
        } else if (data === 'cancel_order') {
            userConversationData[chatId] = {}; // Clear temporary order data
            await bot.editMessageText(
                "Your order has been cancelled.",
                { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "Back to Main Menu", callback_data: "main_menu" }]] } }
            );
        } else {
            await bot.editMessageText(
                "Something went wrong. Please start over by typing /start.",
                { chat_id: chatId, message_id: messageId }
            );
        }
        userConversationState[chatId] = CONVERSATION_STATE.NONE;
    } else if (data === 'main_menu') {
        const keyboard = [
            [{ text: "View Products", callback_data: "view_products" }],
            [{ text: "View Cart", callback_data: "view_cart" }],
            [{ text: "Checkout", callback_data: "checkout" }],
        ];
        const replyMarkup = { inline_keyboard: keyboard };
        await bot.sendMessage(chatId, "Welcome back to the Main Menu! Please choose an option:", { reply_markup: replyMarkup });
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (text.startsWith('/')) { // Ignore commands handled by onText
        return;
    }

    const currentState = userConversationState[chatId] || CONVERSATION_STATE.NONE;

    switch (currentState) {
        case CONVERSATION_STATE.PHONE_NUMBER:
            if (!/^\+?\d{10,15}$/.test(text)) {
                await bot.sendMessage(chatId, 'Invalid phone number. Please provide a valid number (e.g., +1234567890).');
                return;
            }
            userConversationData[chatId].phoneNumber = text;
            userConversationState[chatId] = CONVERSATION_STATE.SHIPPING_ADDRESS;
            await bot.sendMessage(chatId, 'Please provide your shipping address.');
            break;
        case CONVERSATION_STATE.SHIPPING_ADDRESS:
            if (!text || text.length < 5) {
                await bot.sendMessage(chatId, 'Invalid shipping address. Please provide a valid address (at least 5 characters).');
                return;
            }
            userConversationData[chatId].shippingAddress = text;
            userConversationState[chatId] = CONVERSATION_STATE.CONFIRM_ORDER;

            let orderSummary = "Please confirm your order details:\n\n";
            const cart = userConversationData[chatId].cart || {};
            let totalPrice = 0.0;
            for (const productId in cart) {
                const quantity = cart[productId];
                const productInfo = PRODUCTS[productId];
                const name = productInfo.name;
                const price = productInfo.price;
                const itemPrice = price * quantity;
                orderSummary += `- ${name} (x${quantity}) - $${itemPrice.toFixed(2)}\n`;
                totalPrice += itemPrice;
            }

            const phoneNumber = userConversationData[chatId].phoneNumber || 'N/A';
            const shippingAddress = userConversationData[chatId].shippingAddress || 'N/A';

            orderSummary += `\nTotal: $${totalPrice.toFixed(2)}`;
            orderSummary += `\nPhone Number: ${phoneNumber}`;
            orderSummary += `\nShipping Address: ${shippingAddress}`;

            const keyboard = [
                [{ text: "Confirm Order", callback_data: "confirm_order" }],
                [{ text: "Cancel Order", callback_data: "cancel_order" }],
            ];
            const replyMarkup = { inline_keyboard: keyboard };
            await bot.sendMessage(chatId, orderSummary, { reply_markup: replyMarkup });
            break;
        default:
            // Handle unexpected messages or provide a default response
            break;
    }
});

async function displayProduct(chatId, messageId, userId, index) {
    const productIds = Object.keys(PRODUCTS);
    const productId = productIds[index];
    const productInfo = PRODUCTS[productId];

    const keyboard = [
        [
            { text: "Previous", callback_data: `prev_product_${index}` },
            { text: "Next", callback_data: `next_product_${index}` },
        ],
        [
            { text: `Add ${productInfo.name}`, callback_data: `add_to_cart_${productId}` }
        ],
        [{ text: "Back to Main Menu", callback_data: "main_menu" }],
    ];
    const replyMarkup = { inline_keyboard: keyboard };

    const caption = `${productInfo.name} - $${productInfo.price.toFixed(2)}\n${productInfo.description}\n\nProduct ${index + 1}/${productIds.length}`;

    try {
        const photoPath = productInfo.image;
        const photoBuffer = fs.readFileSync(photoPath);

        // Telegram Bot API for Node.js doesn't have a direct editMedia for photos with file buffers.
        // A common workaround is to send a new photo and delete the old message, or edit caption/reply_markup only.
        // For simplicity, we'll send a new photo and edit the caption/reply_markup of the previous message if possible.
        // If it's the first product display, send a new photo.

        if (messageId) {
            // Try to edit the message if it's an existing one (e.g., from navigation)
            // Note: Telegram Bot API for Node.js `editMessageMedia` does not support `InputMediaPhoto` with file paths directly.
            // It expects a file_id or URL. Sending a new photo is often easier for local files.
            // For now, we'll send a new photo and update the messageId in context if needed.
            await bot.sendPhoto(chatId, photoBuffer, { caption: caption, reply_markup: replyMarkup });
            // Optionally, delete the old message if you want to avoid multiple product messages
            // await bot.deleteMessage(chatId, messageId);
        } else {
            await bot.sendPhoto(chatId, photoBuffer, { caption: caption, reply_markup: replyMarkup });
        }

    } catch (error) {
        console.error(`Error displaying product: ${error.message}`);
        await bot.sendMessage(chatId, `Error: Image for ${productInfo.name} not found or could not be displayed.`);
    }
}

// Handle /cancel command for conversation fallback
bot.onText(/\/cancel/, async (msg) => {
    const chatId = msg.chat.id;
    userConversationState[chatId] = CONVERSATION_STATE.NONE;
    userConversationData[chatId] = {};
    await bot.sendMessage(chatId, 'Checkout process cancelled. Use /start to return to the main menu.');
});

console.log('Bot started...');


