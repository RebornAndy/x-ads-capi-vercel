// X Ads / Twitter Ads Pixel + CAPI relay for Shopify Customer Events
// Paste this directly into Shopify Settings > Customer events > Custom pixel.
// Do not add <script> tags.

var X_PIXEL_ID = "rbtru";

var X_EVENTS = {
  PAGE_VIEW: "tw-rbtru-rbtve",
  ADD_TO_CART: "tw-rbtru-rbtv4",
  PURCHASE: "tw-rbtru-rbtrw"
};

// Replace this after Vercel deploys.
var X_CAPI_ENDPOINT = "https://YOUR-VERCEL-PROJECT.vercel.app/api/x-capi";

(function () {
  if (window.twq) {
    return;
  }

  var twq = window.twq = function () {
    twq.exe ? twq.exe.apply(twq, arguments) : twq.queue.push(arguments);
  };

  twq.version = "1.1";
  twq.queue = [];

  var script = document.createElement("script");
  script.async = true;
  script.src = "https://static.ads-twitter.com/uwt.js";

  var firstScript = document.getElementsByTagName("script")[0];
  firstScript.parentNode.insertBefore(script, firstScript);

  twq("config", X_PIXEL_ID);
})();

function safeString(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function getAmount(money) {
  if (!money) {
    return undefined;
  }

  if (money.amount !== undefined && money.amount !== null) {
    return Number(money.amount);
  }

  return undefined;
}

function getCurrency(money) {
  if (money && money.currencyCode) {
    return money.currencyCode;
  }

  return "USD";
}

function getCurrentUrl(event) {
  if (
    event &&
    event.context &&
    event.context.document &&
    event.context.document.location &&
    event.context.document.location.href
  ) {
    return event.context.document.location.href;
  }

  return "";
}

function getUserAgent(event) {
  if (
    event &&
    event.context &&
    event.context.navigator &&
    event.context.navigator.userAgent
  ) {
    return event.context.navigator.userAgent;
  }

  if (window.navigator && window.navigator.userAgent) {
    return window.navigator.userAgent;
  }

  return "";
}

function getTwclid(event) {
  var url = getCurrentUrl(event);
  var match = url.match(/[?&]twclid=([^&#]+)/);

  if (match && match[1]) {
    var value = decodeURIComponent(match[1]);
    try {
      localStorage.setItem("x_twclid", value);
    } catch (error) {}
    return value;
  }

  try {
    return localStorage.getItem("x_twclid") || "";
  } catch (error) {
    return "";
  }
}

function makeConversionId(prefix, event, fallback) {
  if (event && event.id) {
    return prefix + "-" + event.id;
  }

  if (fallback) {
    return prefix + "-" + fallback;
  }

  return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function sendToXCapi(payload) {
  if (!X_CAPI_ENDPOINT || X_CAPI_ENDPOINT.indexOf("YOUR-VERCEL-PROJECT") !== -1) {
    return;
  }

  fetch(X_CAPI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    keepalive: true,
    body: JSON.stringify(payload)
  }).catch(function (error) {
    console.warn("X CAPI send failed:", error);
  });
}

analytics.subscribe("page_viewed", function (event) {
  var conversionId = makeConversionId("pageview", event, "");
  var currentUrl = getCurrentUrl(event);

  twq("event", X_EVENTS.PAGE_VIEW, {
    conversion_id: conversionId
  });

  sendToXCapi({
    event_name: "PageVisit",
    event_id: X_EVENTS.PAGE_VIEW,
    conversion_id: conversionId,
    twclid: getTwclid(event),
    event_source_url: currentUrl,
    user_agent: getUserAgent(event),
    conversion_time: new Date().toISOString()
  });
});

analytics.subscribe("product_added_to_cart", function (event) {
  var cartLine = {};
  var merchandise = {};
  var product = {};
  var price = {};
  var productId = "";
  var productTitle = "";
  var quantity = 1;

  if (event && event.data && event.data.cartLine) {
    cartLine = event.data.cartLine;
  }

  if (cartLine.merchandise) {
    merchandise = cartLine.merchandise;
  }

  if (merchandise.product) {
    product = merchandise.product;
  }

  if (cartLine.cost && cartLine.cost.totalAmount) {
    price = cartLine.cost.totalAmount;
  } else if (merchandise.price) {
    price = merchandise.price;
  }

  if (product.id) {
    productId = product.id;
  } else if (merchandise.id) {
    productId = merchandise.id;
  }

  if (product.title) {
    productTitle = product.title;
  } else if (merchandise.title) {
    productTitle = merchandise.title;
  }

  if (cartLine.quantity) {
    quantity = cartLine.quantity;
  }

  var value = getAmount(price);
  var currency = getCurrency(price);
  var conversionId = makeConversionId("addtocart", event, productId);
  var contents = [
    {
      content_id: safeString(productId),
      content_name: safeString(productTitle),
      content_type: "product",
      quantity: quantity
    }
  ];

  twq("event", X_EVENTS.ADD_TO_CART, {
    value: value,
    currency: currency,
    conversion_id: conversionId,
    contents: contents
  });

  sendToXCapi({
    event_name: "AddToCart",
    event_id: X_EVENTS.ADD_TO_CART,
    conversion_id: conversionId,
    value: value,
    currency: currency,
    number_items: quantity,
    contents: contents,
    twclid: getTwclid(event),
    event_source_url: getCurrentUrl(event),
    user_agent: getUserAgent(event),
    conversion_time: new Date().toISOString()
  });
});

analytics.subscribe("checkout_completed", function (event) {
  var checkout = {};
  var orderId = "";
  var totalPrice = {};
  var lineItems = [];
  var contents = [];
  var email = "";
  var phone = "";
  var totalQuantity = 0;

  if (event && event.data && event.data.checkout) {
    checkout = event.data.checkout;
  }

  if (checkout.order && checkout.order.id) {
    orderId = checkout.order.id;
  } else if (checkout.order && checkout.order.name) {
    orderId = checkout.order.name;
  } else if (checkout.token) {
    orderId = checkout.token;
  } else if (checkout.id) {
    orderId = checkout.id;
  }

  if (checkout.totalPrice) {
    totalPrice = checkout.totalPrice;
  }

  if (checkout.lineItems) {
    lineItems = checkout.lineItems;
  }

  for (var i = 0; i < lineItems.length; i++) {
    var item = lineItems[i];
    var variant = {};
    var product = {};
    var itemPrice = {};
    var itemQuantity = item.quantity || 1;

    if (item.variant) {
      variant = item.variant;
    }

    if (variant.product) {
      product = variant.product;
    }

    if (item.finalLinePrice) {
      itemPrice = item.finalLinePrice;
    } else if (item.linePrice) {
      itemPrice = item.linePrice;
    } else if (variant.price) {
      itemPrice = variant.price;
    }

    totalQuantity += itemQuantity;

    contents.push({
      content_id: safeString(product.id || variant.id || item.id || ""),
      content_name: safeString(product.title || variant.title || item.title || ""),
      content_type: "product",
      quantity: itemQuantity,
      price: getAmount(itemPrice)
    });
  }

  if (checkout.email) {
    email = checkout.email;
  } else if (checkout.buyerIdentity && checkout.buyerIdentity.email) {
    email = checkout.buyerIdentity.email;
  }

  if (checkout.phone) {
    phone = checkout.phone;
  } else if (checkout.billingAddress && checkout.billingAddress.phone) {
    phone = checkout.billingAddress.phone;
  } else if (checkout.shippingAddress && checkout.shippingAddress.phone) {
    phone = checkout.shippingAddress.phone;
  }

  var value = getAmount(totalPrice);
  var currency = getCurrency(totalPrice);
  var conversionId = makeConversionId("purchase", event, orderId);

  twq("event", X_EVENTS.PURCHASE, {
    value: value,
    currency: currency,
    conversion_id: conversionId,
    contents: contents
  });

  sendToXCapi({
    event_name: "Purchase",
    event_id: X_EVENTS.PURCHASE,
    conversion_id: conversionId,
    order_id: safeString(orderId),
    value: value,
    currency: currency,
    number_items: totalQuantity,
    contents: contents,
    email_address: email,
    phone_number: phone,
    twclid: getTwclid(event),
    event_source_url: getCurrentUrl(event),
    user_agent: getUserAgent(event),
    conversion_time: new Date().toISOString()
  });
});
