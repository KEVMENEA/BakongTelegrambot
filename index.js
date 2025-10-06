const { Telegraf, Markup } = require('telegraf');
const dotenv = require('dotenv');
const QRCode = require('qrcode');
const { BakongKHQR, khqrData, IndividualInfo } = require("bakong-khqr");
const axios = require('axios');

// Load environment variables
dotenv.config();
const bakongConfig = {
    bakongToken: process.env.BAKONG_API_TOKEN,
    bakongToken: process.env.BAKONG_TOKEN,
}
// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Store structure with categories and products
const categories = [
    { id: 1, name: 'T-Shirts' },
    { id: 2, name: 'Jeans' },
    { id: 3, name: 'Dresses' },
    { id: 4, name: 'Accessories' }
];

const products = {
    'T-Shirts': [
        {
            id: 1,
            name: 'Classic White Tee',
            price: 0.01,
            description: 'Pure cotton basic white t-shirt',
            image: 'https://diversion.pk/cdn/shop/files/Black-Tshirt.png?v=1726441887'
        },
        {
            id: 2,
            name: 'Print Mens',
            price: 0.01,
            description: 'Pure cotton basic white t-shirt',
            image: 'https://static.owayo-cdn.com/newhp/img/productHome/productSeitenansicht/productservice/tshirts_classic_herren_basic_productservice/tshirt_basic_4.jpg'
        },
        // more products...
    ],
    'Jeans': [
        {
            id: 1,
            name: 'Grey colour top jeans pant',
            price: 0.01,
            description: 'Pure cotton basic white t-shirt',
            image: 'https://www.buffalojeans.com/cdn/shop/products/BM22721_035BM22721_1000x.jpg?v=1627494224'
        },
        {
            id: 2,
            name: 'Men Lightly Washed Slim Fit Jeans',
            price: 0.01,
            description: 'Pure cotton basic white t-shirt',
            image: 'https://assets.ajio.com/medias/sys_master/root/20230807/jlW1/64d10100eebac147fcaeb73a/-473Wx593H-442180261-lightgrey-MODEL.jpg'
        },
        // more products...
    ],
    // more categories...
};

// Shopping cart store
const shoppingCarts = new Map();

// Start command handler
bot.command('start', (ctx) => {
    ctx.reply(
        'Welcome to our Clothing Shop! 🛍️\n\nChoose a category to start shopping:',
        Markup.keyboard(categories.map(cat => cat.name)).resize()
    );
});

// Handle category selection
bot.hears(categories.map(cat => cat.name), async (ctx) => {
    const category = ctx.message.text;
    const categoryProducts = products[category];

    // Send each product as a separate message with image
    for (const product of categoryProducts) {
        try {
            const message = `${product.id}. ${product.name}\n` +
                `💰 Price: $${product.price}\n` +
                `📝 ${product.description}\n\n` +
                `To add to cart: /add ${product.id} [quantity]`;

            await ctx.replyWithPhoto(
                product.image,
                {
                    caption: message,
                    parse_mode: 'HTML'
                }
            );
        } catch (error) {
            console.error(`Failed to send image for product ${product.id}:`, error);
            const message = `❌ Image unavailable\n\n` +
                `${product.id}. ${product.name}\n` +
                `💰 Price: $${product.price}\n` +
                `📝 ${product.description}\n\n` +
                `To add to cart: /add ${product.id} [quantity]`;

            await ctx.reply(message);
        }
    }

    // Send navigation buttons after products
    await ctx.reply('What would you like to do?',
        Markup.keyboard([
            ['View Cart 🛒'],
            ['Back to Categories']
        ]).resize()
    );
});

// Add to cart command
bot.command('add', (ctx) => {
    const userId = ctx.from.id;
    const [command, productId, quantity = 1] = ctx.message.text.split(' ');

    if (!productId || isNaN(productId)) {
        return ctx.reply('Please provide a valid product ID. Example: /add 1 2');
    }

    let product = null;
    for (const categoryProducts of Object.values(products)) {
        product = categoryProducts.find(p => p.id === parseInt(productId));
        if (product) break;
    }

    if (!product) {
        return ctx.reply('Product not found!');
    }

    if (!shoppingCarts.has(userId)) {
        shoppingCarts.set(userId, []);
    }

    const cart = shoppingCarts.get(userId);
    const existingItem = cart.find(item => item.productId === product.id);

    if (existingItem) {
        existingItem.quantity += parseInt(quantity);
    } else {
        cart.push({ productId: product.id, quantity: parseInt(quantity), product });
    }

    ctx.reply(`Added ${quantity}x ${product.name} to your cart!`);
});
// View cart handler
bot.hears('View Cart 🛒', async (ctx) => {
    const userId = ctx.from.id;
    const cart = shoppingCarts.get(userId) || [];

    if (cart.length === 0) {
        return ctx.reply('Your cart is empty!');
    }

    let total = 0;

    // Send each cart item with its image
    for (const item of cart) {
        const subtotal = item.product.price * item.quantity;
        total += subtotal;

        try {
            const message = `${item.product.name}\n` +
                `Quantity: ${item.quantity}\n` +
                `Subtotal: $${subtotal.toFixed(2)}`;

            await ctx.replyWithPhoto(
                item.product.image,
                { caption: message }
            );
        } catch (error) {
            const message = `❌ Image unavailable\n\n` +
                `${item.product.name}\n` +
                `Quantity: ${item.quantity}\n` +
                `Subtotal: $${subtotal.toFixed(2)}`;

            await ctx.reply(message);
        }
    }

    // Send total and available commands
    const summaryMessage = `Total: $${total.toFixed(2)}\n\n` +
        'Commands:\n' +
        '/checkout - Proceed to payment\n' +
        '/clear - Clear cart';

    await ctx.reply(summaryMessage);
});
// Back to categories handler
bot.hears('Back to Categories', (ctx) => {
    ctx.reply(
        'Choose a category:',
        Markup.keyboard(categories.map(cat => cat.name)).resize()
    );
});

// Clear cart command
bot.command('clear', (ctx) => {
    const userId = ctx.from.id;
    shoppingCarts.delete(userId);
    ctx.reply('Cart cleared!');
});

// Checkout command
bot.command('checkout', async (ctx) => {
    const userId = ctx.from.id;
    const cart = shoppingCarts.get(userId);

    if (!cart || cart.length === 0) {
        return ctx.reply('Your cart is empty!');
    }

    const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

    try {
        // Generate unique order ID
        const orderId = `ORDER${Date.now()}`;

        // Generate KHQR data
        const individualInfo = new IndividualInfo(
            "noch_phanet@aclb",
            khqrData.currency.usd,
            "PhnomPenh",
            {
                currency: khqrData.currency.usd,
                amount: total,
                mobileNumber: "85511504463",
                storeLabel: "Clothing Shop",
                purposeOfTransaction: "Payment",
            }
        );
        const khqr = new BakongKHQR();
        const response = khqr.generateIndividual(individualInfo);

        // Generate QR code image
        const qrImageBuffer = await QRCode.toBuffer(response.data.qr, {
            width: 200,
            margin: 1,
        });

        // Send QR code to user
        await ctx.replyWithPhoto({ source: qrImageBuffer }, {
            caption: `Payment QR Code for $${total.toFixed(2)}\nOrder ID: ${orderId}\n\nScan this QR code with your Bakong-enabled banking app to complete the payment.`
        });

        // Start payment status checking
        checkPaymentLoop(ctx, orderId, response.data.md5, total, userId);
    } catch (error) {
        console.error('Checkout error:', error);
        ctx.reply('Sorry, there was an error generating the payment QR code. Please try again.');
    }
});

// Payment status checking function
async function checkPaymentLoop(ctx, orderId, md5, amount, userId) {
    const maxAttempts = 30;
    let attempts = 0;

    const interval = setInterval(async () => {
        try {
            attempts++;

            const status = await checkPaymentStatus(md5);

            if (status.responseCode === 0) {
                clearInterval(interval);
                const cart = shoppingCarts.get(userId);

                // Prepare order details for admin notification
                const orderDetails = {
                    orderId,
                    amount,
                    customer: {
                        id: userId,
                    },
                    items: cart
                };

                // Clear the cart
                shoppingCarts.delete(userId);

                try {
                    // Send success message to customer
                    await ctx.reply(`✅ Payment of $${amount.toFixed(2)} completed successfully! Thank you for your purchase.`);

                } catch (error) {
                    console.error('Error in payment success handling:', error);
                }
                return;
            }

            if (attempts >= maxAttempts) {
                clearInterval(interval);
                try {
                    await ctx.reply('⏳ Payment time expired. Please try again.');
                } catch (error) {
                    console.error('Error sending expiration message:', error);
                }
            }
        } catch (error) {
            console.error('Error checking payment status:', error);
            await ctx.reply('❌ An error occurred while checking your payment. Please try again later.');
        }
    }, 10000);
}

// Helper function to check payment status
async function checkPaymentStatus(md5) {
    try {
        const url = "https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5";
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `${process.env.BAKONG_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ md5 }),
        });
        return await res.json();
    } catch (error) {
        console.error('Error checking payment status:', error);
        throw new Error('Failed to check payment status');
    }
}

// Error handler
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    ctx.reply('An error occurred. Please try again later.');
});

// Start the bot
bot.launch().then(() => {
    console.log('Clothing Shop Bot is running...');
}).catch(error => {
    console.error('Failed to start bot:', error);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));