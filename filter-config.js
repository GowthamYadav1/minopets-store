const categoryFilters = {
    Fish: ['availability', 'price', 'temperament', 'swimmingZone', 'schooling', 'tankSize'],
    Shrimps: ['availability', 'price', 'careLevel', 'waterType', 'grade', 'breeding'],
    Plants: ['availability', 'price', 'careLevel', 'co2', 'lighting', 'placement'],
    Accessories: ['availability', 'price', 'tankSize', 'filterType', 'lightType', 'substrateType', 'mediaType', 'toolType'],
    Aquarium: ['availability', 'price', 'volume', 'tankShape', 'glassType', 'rimType', 'thickness', 'includes']
};

const filterDefinitions = {
    availability: {
        label: 'Availability',
        type: 'checkbox',
        options: [
            { value: 'inStock', label: 'In stock' },
            { value: 'outOfStock', label: 'Out of stock' }
        ]
    },
    price: {
        label: 'Price',
        type: 'range',
        prefix: '₹'
    },
    careLevel: {
        label: 'Care Level',
        type: 'checkbox',
        options: [
            { value: 'Beginner', label: 'Beginner' },
            { value: 'Intermediate', label: 'Intermediate' },
            { value: 'Advanced', label: 'Advanced' }
        ]
    },
    co2: {
        label: 'CO₂ Requirement',
        type: 'checkbox',
        options: [
            { value: 'Low', label: 'Low' },
            { value: 'Medium', label: 'Medium' },
            { value: 'High', label: 'High' }
        ]
    },
    lighting: {
        label: 'Lighting',
        type: 'checkbox',
        options: [
            { value: 'Low', label: 'Low' },
            { value: 'Medium', label: 'Medium' },
            { value: 'High', label: 'High' }
        ]
    },
    placement: {
        label: 'Placement',
        type: 'checkbox',
        options: [
            { value: 'Background', label: 'Background' },
            { value: 'Midground', label: 'Midground' },
            { value: 'Foreground', label: 'Foreground' }
        ]
    },
    temperament: {
        label: 'Temperament',
        type: 'checkbox',
        options: [
            { value: 'Peaceful', label: 'Peaceful' },
            { value: 'Semi-aggressive', label: 'Semi-aggressive' },
            { value: 'Aggressive', label: 'Aggressive' }
        ]
    },
    swimmingZone: {
        label: 'Swimming Zone',
        type: 'checkbox',
        options: [
            { value: 'Top', label: 'Top' },
            { value: 'Middle', label: 'Middle' },
            { value: 'Bottom', label: 'Bottom' }
        ]
    },
    schooling: {
        label: 'Schooling',
        type: 'checkbox',
        options: [
            { value: 'Schooling', label: 'Schooling' },
            { value: 'Solo / Pair', label: 'Solo / Pair' }
        ]
    },
    tankSize: {
        label: 'Min. Tank Size',
        type: 'checkbox',
        options: [
            { value: 'Nano (5–20L)', label: 'Nano (5–20L)' },
            { value: 'Small (20–60L)', label: 'Small (20–60L)' },
            { value: 'Medium (60–120L)', label: 'Medium (60–120L)' },
            { value: 'Large (120L+)', label: 'Large (120L+)' }
        ]
    },
    waterType: {
        label: 'Water Type',
        type: 'checkbox',
        options: [
            { value: 'Neocaridina', label: 'Neocaridina' },
            { value: 'Caridina', label: 'Caridina / Soft water' }
        ]
    },
    grade: {
        label: 'Grade',
        type: 'checkbox',
        options: [
            { value: 'Standard', label: 'Standard' },
            { value: 'High Grade', label: 'High Grade' },
            { value: 'Premium', label: 'Premium' }
        ]
    },
    breeding: {
        label: 'Breeding',
        type: 'checkbox',
        options: [
            { value: 'Easy', label: 'Easy' },
            { value: 'Moderate', label: 'Moderate' },
            { value: 'Advanced', label: 'Advanced' }
        ]
    },
    filterType: {
        label: 'Filter / Pump type',
        type: 'checkbox',
        forSubcategories: ['Filters & Pumps'],
        options: [
            { value: 'Hang-on-back', label: 'Hang-on-back' },
            { value: 'Internal', label: 'Internal' },
            { value: 'External', label: 'External' },
            { value: 'Sponge', label: 'Sponge' },
            { value: 'Pump / Powerhead', label: 'Pump / Powerhead' }
        ]
    },
    lightType: {
        label: 'Light type',
        type: 'checkbox',
        forSubcategories: ['Lighting'],
        options: [
            { value: 'Submersible', label: 'Submersible' },
            { value: 'Clip-on', label: 'Clip-on' },
            { value: 'Top hanging', label: 'Top hanging' },
            { value: 'Hood / Lid', label: 'Hood / Lid' }
        ]
    },
    substrateType: {
        label: 'Substrate type',
        type: 'checkbox',
        forSubcategories: ['Substrate & Soil'],
        options: [
            { value: 'Aquasoil', label: 'Aquasoil' },
            { value: 'Plant Substrate', label: 'Plant Substrate' },
            { value: 'Gravel', label: 'Gravel' },
            { value: 'Sand', label: 'Sand' },
            { value: 'Substrate Additives', label: 'Substrate Additives' }
        ]
    },
    mediaType: {
        label: 'Media type',
        type: 'checkbox',
        forSubcategories: ['Filter Media'],
        options: [
            { value: 'Mechanical Media', label: 'Mechanical Media' },
            { value: 'Biological Media', label: 'Biological Media' },
            { value: 'Chemical Media', label: 'Chemical Media' },
            { value: 'Filter Sponges', label: 'Filter Sponges' },
            { value: 'Filter Pads', label: 'Filter Pads' }
        ]
    },
    toolType: {
        label: 'Tool type',
        type: 'checkbox',
        forSubcategories: ['Aquascape Tools'],
        options: [
            { value: 'Multipurpose', label: 'Multipurpose' },
            { value: 'Planting Tools', label: 'Planting Tools' },
            { value: 'Maintenance Tools', label: 'Maintenance Tools' },
            { value: 'Scaping Tools', label: 'Scaping Tools' }
        ]
    },
    tankShape: {
        label: 'Tank shape',
        type: 'checkbox',
        options: [
            { value: 'Rectangular', label: 'Rectangular' },
            { value: 'Cube', label: 'Cube' },
            { value: 'Cylinder', label: 'Cylinder' },
            { value: 'Bowfront', label: 'Bowfront' },
            { value: 'Wall hanging', label: 'Wall hanging' }
        ]
    },
    glassType: {
        label: 'Glass type',
        type: 'checkbox',
        options: [
            { value: 'Standard', label: 'Standard' },
            { value: 'Ultra clear', label: 'Ultra clear' },
            { value: 'Tempered', label: 'Tempered' }
        ]
    },
    rimType: {
        label: 'Rim style',
        type: 'checkbox',
        options: [
            { value: 'Rimless', label: 'Rimless' },
            { value: 'Braced / Rimmed', label: 'Braced / Rimmed' }
        ]
    },
    volume: {
        label: 'Volume',
        type: 'checkbox',
        options: [
            { value: 'Nano (5–20L)', label: 'Nano (5–20L)' },
            { value: 'Small (20–60L)', label: 'Small (20–60L)' },
            { value: 'Medium (60–120L)', label: 'Medium (60–120L)' },
            { value: 'Large (120L+)', label: 'Large (120L+)' },
            { value: 'XL (200L+)', label: 'XL (200L+)' }
        ]
    },
    thickness: {
        label: 'Glass thickness',
        type: 'checkbox',
        options: [
            { value: '5 mm', label: '5 mm' },
            { value: '6 mm', label: '6 mm' },
            { value: '8 mm', label: '8 mm' },
            { value: '10 mm', label: '10 mm' },
            { value: '12 mm+', label: '12 mm+' }
        ]
    },
    includes: {
        label: 'Includes',
        type: 'checkbox',
        options: [
            { value: 'Tank only', label: 'Tank only' },
            { value: 'With hood', label: 'With hood' },
            { value: 'With stand', label: 'With stand' },
            { value: 'Full kit', label: 'Full kit' }
        ]
    }
};

const categoryMeta = {
    Fish: {
        slug: 'fish',
        image: '/assets/Neon-tetra.png',
        description: 'Barbs & minnows, bettas, flowerhorn, combos & more'
    },
    Shrimps: {
        slug: 'shrimps',
        image: '/assets/Cherry-shrimp.jpg',
        description: 'Neocaridina colonies & curated shrimp combo packs'
    },
    Plants: {
        slug: 'plants',
        image: '/assets/planted-tank.jpg',
        description: 'Carpet plants, stems, moss, tissue culture, combos & aquascape greens'
    },
    Accessories: {
        slug: 'accessories',
        image: '/assets/aquarium_accessories.png',
        description: 'Filters, lighting, filter media, combo kits & aquascape tools'
    },
    Aquarium: {
        slug: 'aquarium',
        image: '/assets/aquarium.jpg',
        description: 'Wall hanging, ultra clear glass & imported aquariums'
    }
};

const slugToCategory = Object.fromEntries(
    Object.entries(categoryMeta).map(([name, meta]) => [meta.slug, name])
);

function subcategoryToSlug(name) {
    return name.toLowerCase()
        .replace(/&/g, 'and')
        .replace(/₂/g, '2')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function slugToSubcategory(category, slug) {
    const subs = categories[category] || [];
    return subs.find(s => subcategoryToSlug(s) === slug) || null;
}

function isComboSubcategory(name) {
    return /combo/i.test(name);
}

function sortedSubcategories(category) {
    return [...(categories[category] || [])].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
}

function orderedSubcategories(category) {
    const subs = sortedSubcategories(category);
    const combos = subs.filter(isComboSubcategory);
    const regular = subs.filter(name => !isComboSubcategory(name));
    return [...combos, ...regular];
}
