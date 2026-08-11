/**
 * Footer policy modals: Shipping, Live Arrival Guarantee, Refund & Cancellation, Care Guides.
 */

const POLICY_WHATSAPP = 'https://wa.me/919035559089';

const POLICIES = {
    shipping: {
        title: 'Shipping Policy',
        hero: '/assets/policy-shipping-hero.jpg',
        body: `
            <section class="policy-block">
                <img class="policy-block-icon" src="/assets/icons/policy-pickup.png" alt="" width="120" height="120">
                <div class="policy-block-body">
                    <h3>Self pickup</h3>
                    <ul>
                        <li>Choose <strong>Self Pickup</strong> at checkout to skip shipping fees.</li>
                        <li>After you place your order, we prepare it and notify you by <strong>email or WhatsApp</strong> when it is ready for collection.</li>
                        <li>Pickup hours: <strong>6:00 PM – 9:30 PM</strong> on business days.</li>
                        <li>Please bring your order confirmation when you collect your order.</li>
                    </ul>
                </div>
            </section>

            <section class="policy-block">
                <img class="policy-block-icon" src="/assets/icons/policy-bengaluru.png" alt="" width="120" height="120">
                <div class="policy-block-body">
                    <h3>Home delivery — Bengaluru</h3>
                    <ul>
                        <li>We offer home delivery across Bengaluru for live fish, aquarium plants, accessories, and fish food.</li>
                        <li><strong>Free shipping</strong> on orders of <strong>₹1,000 or more</strong>. Orders below ₹1,000 attract a delivery fee (shown at checkout).</li>
                    </ul>
                </div>
            </section>

            <section class="policy-block">
                <img class="policy-block-icon" src="/assets/icons/policy-outstation.png" alt="" width="120" height="120">
                <div class="policy-block-body">
                    <h3>Orders outside Bengaluru</h3>
                    <ul>
                        <li>For locations outside Bengaluru, please send your order request on <a href="${POLICY_WHATSAPP}?text=${encodeURIComponent('Hi Mino Pets, I want to place an order outside Bangalore.')}" target="_blank" rel="noopener">WhatsApp support</a>.</li>
                        <li>We aim for home delivery wherever possible. In some areas, the courier partner may ask you to collect the shipment from their hub due to service restrictions — please do so promptly, especially for live items.</li>
                        <li>Standard delivery time for outstation orders is <strong>5–7 business days</strong> from dispatch. Timelines may vary by location, courier delays, public holidays, weather, or other disruptions.</li>
                    </ul>
                </div>
            </section>

            <section class="policy-block">
                <img class="policy-block-icon" src="/assets/icons/policy-aquarium.png" alt="" width="120" height="120">
                <div class="policy-block-body">
                    <h3>Aquariums &amp; cabinets</h3>
                    <ul>
                        <li>Product price does <strong>not</strong> include installation. We do not install aquariums or cabinets.</li>
                        <li>These items are delivered via porter / heavy-goods service. You are responsible for receiving the order at the delivery point.</li>
                        <li>Unloading is your responsibility. Our team does not handle unloading or placement inside your home.</li>
                    </ul>
                </div>
            </section>

            <section class="policy-block">
                <img class="policy-block-icon" src="/assets/icons/policy-schedule.png" alt="" width="120" height="120">
                <div class="policy-block-body">
                    <h3>Shipping schedule</h3>
                    <ul>
                        <li><strong>Bengaluru orders</strong> are typically delivered the <strong>next day</strong> after you place the order (subject to cutoff times and stock).</li>
                        <li>For live fish, we begin a quarantine / holding period when your order is confirmed so livestock is healthy before dispatch.</li>
                        <li>During high order volumes, shipments may be delayed by a few days.</li>
                        <li>If there is a significant delay, we will contact you by WhatsApp or phone.</li>
                    </ul>
                </div>
            </section>

            <section class="policy-block">
                <img class="policy-block-icon" src="/assets/icons/policy-tracking.png" alt="" width="120" height="120">
                <div class="policy-block-body">
                    <h3>Tracking &amp; receiving your order</h3>
                    <ul>
                        <li>Once dispatched, you will receive email or WhatsApp updates with the courier partner’s name and tracking number or link (where applicable).</li>
                        <li>You are responsible for tracking your parcel and being available to receive it on time.</li>
                        <li>Contact us if you notice unusual delays after dispatch.</li>
                        <li>Please keep your address and phone number accurate. Failed delivery due to an incorrect address or unavailability may result in the shipment returning to us; <strong>re-shipping charges</strong> will apply for re-dispatch.</li>
                    </ul>
                </div>
            </section>

            <section class="policy-block">
                <img class="policy-block-icon" src="/assets/icons/policy-live.png" alt="" width="120" height="120">
                <div class="policy-block-body">
                    <h3>Live items — important</h3>
                    <ul>
                        <li>Please be available to receive live deliveries promptly and follow any unpacking guidance we share.</li>
                        <li>Claims related to livestock condition on arrival are covered under our <button type="button" class="policy-inline-link" onclick="openPolicy('live-arrival')">Live Arrival Guarantee</button>.</li>
                    </ul>
                </div>
            </section>

            <p class="policy-note">Questions about shipping? <a href="${POLICY_WHATSAPP}?text=${encodeURIComponent('Hi Mino Pets, question about shipping.')}" target="_blank" rel="noopener">Chat with us on WhatsApp</a>.</p>
        `,
    },
    'live-arrival': {
        title: 'Live Arrival Guarantee',
        hero: '/assets/policy-live-arrival-hero.png',
        body: `
            <p>Mino Pets packs every live order with care. Our <strong>100% Live Arrival Guarantee</strong> means livestock should reach you alive and healthy. If something goes wrong in transit under the terms below, we will make it right with a store credit coupon for the affected items.</p>
            <p>This guarantee applies only on the <strong>day of arrival</strong>. It does not cover livestock after they have been released into your aquarium.</p>

            <h3>What the guarantee covers</h3>
            <ul>
                <li>Fish, shrimp, and other livestock that arrive <strong>dead on arrival (DOA)</strong> in their original sealed packing.</li>
                <li>Clear packing or shipment issues that affect livestock welfare, when reported on time with valid evidence.</li>
                <li>Missing ordered items — tell us promptly with a clear photo or video of the <strong>unopened package</strong> and packing slip.</li>
            </ul>

            <h3>Conditions to qualify</h3>
            <ul>
                <li>Claims must be submitted on the <strong>day of delivery</strong>. Later claims will not be accepted.</li>
                <li>Video must be shared within <strong>6 hours</strong> of delivery. Delivery time is taken from the courier company’s tracking record.</li>
                <li>Livestock must still be in the <strong>original, sealed, transparent shipping bag</strong> so items can be identified and counted.</li>
                <li>Once livestock has been introduced into your aquarium, the guarantee ends. We guarantee our packing and transit — not your tank conditions.</li>
                <li>The guarantee is void if you miss the <strong>first delivery attempt</strong>. Tracking details are shared with you; please be available to receive live orders promptly.</li>
                <li>You must provide correct shipping details. Wrong address or delivery to the wrong place that causes excess stress voids the guarantee.</li>
                <li>Claims are void if the fish bag is opened and the fish are not dead inside the bag.</li>
                <li>Free extras, samples, or complimentary livestock or accessories are <strong>not</strong> covered.</li>
            </ul>

            <h3>How to submit a claim</h3>
            <ul>
                <li>Send a clear <strong>video of unpacking</strong> showing the dead livestock still in the original sealed transparent packing.</li>
                <li>Share the video or photos on WhatsApp or email with your Order ID, name, and contact number within 6 hours of delivery, along with your order details.</li>
                <li>For missing items, include a clear picture or video of the unopened package and the packing slip.</li>
                <li>Keep packing materials until our team confirms your claim.</li>
            </ul>

            <h3>What you receive if approved</h3>
            <ul>
                <li>Our team reviews your claim and responds as soon as possible.</li>
                <li>On approval, we issue a <strong>store credit coupon</strong> (via WhatsApp or email) for <strong>100% of the cost</strong> of the dead livestock shown in your photo or video.</li>
                <li>The coupon can be redeemed on your next purchase. Refunds for DOA livestock are issued as store credit, not cash, unless we tell you otherwise.</li>
            </ul>

            <h3>What we cannot guarantee</h3>
            <ul>
                <li>Survival or health of livestock <strong>after</strong> the day of arrival.</li>
                <li>Success in your tank — parameters, aggression, disease from existing stock, or husbandry issues are outside our control.</li>
                <li>Tank-mate compatibility — please research species before buying.</li>
                <li>Missed first delivery attempts, refused delivery, or delayed pickup of the parcel.</li>
                <li>Plants are packed clean and without pesticides, but we cannot promise they are 100% pest-free. Please rinse and quarantine plants before adding them to your display tank. <strong>Tissue culture plants</strong> are supplied free from algae and pests.</li>
                <li>We recommend quarantining all new livestock (fish, shrimp, plants, etc.) before adding them to your main aquarium.</li>
            </ul>

            <p class="policy-note">Need to file a claim? <a href="${POLICY_WHATSAPP}?text=${encodeURIComponent('Hi Mino Pets, I have a live arrival guarantee claim.')}" target="_blank" rel="noopener">Start a WhatsApp claim</a>.</p>
        `,
    },
    refund: {
        title: 'Refund & Cancellation Policy',
        body: `
            <p>We want you to shop with confidence. Here’s how cancellations and refunds work at Mino Pets.</p>

            <h3>Cancellations</h3>
            <ul>
                <li>Once an order is placed, it cannot be deferred or cancelled.</li>
                <li>Complimentary extras, free samples, and giveaways (livestock or accessories) are not covered under our guarantee.</li>
                <li>If we must cancel due to stock or weather, you’ll get a full refund or the option to reschedule.</li>
            </ul>

            <h3>Refunds — live livestock</h3>
            <ul>
                <li>Covered under our <button type="button" class="policy-inline-link" onclick="openPolicy('live-arrival')">Live Arrival Guarantee</button> when claim terms are met (store credit coupon for approved DOA).</li>
                <li>We do not accept returns of live animals for change-of-mind after delivery.</li>
            </ul>

            <h3>Refunds — dry goods &amp; accessories</h3>
            <ul>
                <li>Unused items in original packaging may be eligible for return within <strong>7 days</strong> of delivery if defective or damaged in transit.</li>
                <li>Opened, used, or customer-damaged items are generally not refundable.</li>
                <li>Approved refunds are processed to the original payment method or as store credit, typically within 5–7 business days after approval.</li>
            </ul>

            <h3>How to request</h3>
            <ul>
                <li>WhatsApp us with your order reference, reason, and photos if relevant.</li>
                <li>We’ll confirm next steps — replacement, credit, or refund.</li>
            </ul>

            <p class="policy-note">Questions? <a href="${POLICY_WHATSAPP}?text=${encodeURIComponent('Hi Mino Pets, I need help with a refund or cancellation.')}" target="_blank" rel="noopener">Chat with us on WhatsApp</a>.</p>
        `,
    },
    'care-guides': {
        title: 'Care Guides',
        hero: '/assets/policy-care-guides-hero.png',
        body: `
            <p>Simple care tips to help your fish, shrimp, and plants settle in and thrive. For product-specific advice, message us anytime.</p>

            <h3>Getting started</h3>
            <ul>
                <li>Cycle and stabilize your tank before adding livestock whenever possible.</li>
                <li>Float sealed bags for 15–20 minutes, then drip-acclimate sensitive fish and shrimp.</li>
                <li>Keep lights dim for the first day so new arrivals can settle.</li>
            </ul>

            <h3>Fish</h3>
            <ul>
                <li>Match temperature and temperament to your community (peaceful vs semi-aggressive).</li>
                <li>Feed small amounts 1–2 times daily; remove uneaten food.</li>
                <li>Do regular partial water changes and test ammonia, nitrite, and nitrate.</li>
            </ul>

            <h3>Shrimp</h3>
            <ul>
                <li>Prefer stable, mature tanks with plenty of biofilm, moss, and hiding spots.</li>
                <li>Avoid copper-based medications and sudden parameter swings.</li>
                <li>Offer shrimp-safe foods sparingly; overfeeding fouls the water quickly.</li>
            </ul>

            <h3>Plants</h3>
            <ul>
                <li>Rinse new plants and remove melting leaves after planting.</li>
                <li>Provide suitable light and nutrients for the species (low-tech vs high-tech).</li>
                <li>Trim regularly to keep flow and light reaching lower leaves.</li>
            </ul>

            <p class="policy-note">Need a care guide for your setup? <a href="${POLICY_WHATSAPP}?text=${encodeURIComponent('Hi Mino Pets, I need a care guide.')}" target="_blank" rel="noopener">Chat with us on WhatsApp</a>.</p>
        `,
    },
};

function openPolicy(key) {
    const policy = POLICIES[key];
    const panel = document.getElementById('policy');
    const backdrop = document.getElementById('policy-backdrop');
    const titleEl = document.getElementById('policy-title');
    const bodyEl = document.getElementById('policy-body');
    const heroEl = document.getElementById('policy-hero');
    const heroImg = document.getElementById('policy-hero-img');
    if (!policy || !panel || !bodyEl) return;

    if (typeof closeProductDetail === 'function') closeProductDetail({ fromHistory: true });
    if (typeof closePdpLightbox === 'function') closePdpLightbox({ fromHistory: true });
    if (typeof ModalHistory !== 'undefined') {
        const replacing = ModalHistory.stack.includes('pdp') || ModalHistory.stack.includes('lightbox');
        ModalHistory.forget('pdp');
        ModalHistory.forget('lightbox');
        if (replacing) {
            ModalHistory.stack.push('policy');
            try {
                history.replaceState({ ...(history.state || {}), minoModal: 'policy' }, '', location.href);
            } catch (_) { /* ignore */ }
        } else if (ModalHistory.top() !== 'policy') {
            ModalHistory.push('policy');
        }
    }

    if (titleEl) titleEl.textContent = policy.title;
    bodyEl.innerHTML = policy.body;

    if (heroEl && heroImg) {
        if (policy.hero) {
            heroImg.src = policy.hero;
            heroImg.alt = policy.title;
            heroEl.hidden = false;
        } else {
            heroImg.removeAttribute('src');
            heroImg.alt = '';
            heroEl.hidden = true;
        }
    }

    panel.dataset.policy = key;
    panel.classList.add('is-open');
    backdrop?.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.lock('policy-open');
    else document.body.classList.add('policy-open');
    panel.scrollTop = 0;
}

function closePolicy(opts = {}) {
    const panel = document.getElementById('policy');
    const wasOpen = panel?.classList.contains('is-open');
    const backdrop = document.getElementById('policy-backdrop');
    const heroEl = document.getElementById('policy-hero');
    const heroImg = document.getElementById('policy-hero-img');
    if (panel) {
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
        delete panel.dataset.policy;
    }
    if (heroEl) heroEl.hidden = true;
    if (heroImg) {
        heroImg.removeAttribute('src');
        heroImg.alt = '';
    }
    backdrop?.classList.remove('is-open');
    if (typeof BodyScrollLock !== 'undefined') BodyScrollLock.unlock('policy-open');
    else document.body.classList.remove('policy-open');
    if (wasOpen && !opts.fromHistory && typeof ModalHistory !== 'undefined') {
        ModalHistory.dismiss('policy');
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePolicy();
});
