// ============================================================================
// All site content lives here. Edit this file to make the portfolio yours.
// The page, the 3D world (landing city, globe pins, labels), the loader, the
// "Ask my agent" console, index.html, sitemap.xml and robots.txt all read it.
//
// The person below is FICTIONAL. Replace every value with your own.
// ============================================================================

/* ---------------------------------------------------------------------------
 * profile: who you are. `name` is split on spaces for the two hero lines.
 * ------------------------------------------------------------------------- */
export const profile = {
  name: "Amara Nwosu",
  /** used by the agent when it talks about you in the third person */
  pronouns: { subject: "she", object: "her", possessive: "her" },
  role: "Earth Observation Data Scientist",
  company: "Mbuni Earth Analytics",
  email: "amara@example.com",
  /** big line in the About panel */
  headline: "Maps that hold up on the ground.",
  intro:
    "I turn satellite imagery into crop, flood and land cover maps that county officers, insurers and farmers' groups can act on, from segmentation models to the pipelines that run them every pass.",
  about: [
    "I'm an Earth Observation Data Scientist at Mbuni Earth Analytics in Nairobi. I lead the modelling behind Rainline, our flood and crop monitoring service, and work with field teams who check our maps against what is actually on the ground.",
    "Most of my work is segmentation, change detection and time series on radar and optical imagery. Smallholder plots are small, clouds are stubborn and labels are scarce, so I spend as much time on validation and label strategy as on model architecture.",
    "Before Mbuni I mapped crops for an agritech startup and wetlands for a water research trust on Lake Victoria. I studied geomatic engineering and then geospatial data science at Baobab Coast University in Mombasa.",
  ],
  /** one or two sentences the agent uses for "what does she focus on?" */
  focus:
    "Amara works on crop type mapping, flood extent mapping and land cover change from satellite imagery, using segmentation, change detection and time series models, and on the pipelines and validation that keep those maps reliable season after season.",
  /** schema.org knowsAbout, also used in the page description */
  knowsAbout: ["Earth observation", "Remote sensing", "Image segmentation", "Change detection", "Time series", "Crop mapping", "Flood mapping", "Land cover"],
  /** line above the email in the contact panel */
  contactLead:
    "Working on food security, flood response or land monitoring and need maps you can trust? Send a signal.",
};

/* ---------------------------------------------------------------------------
 * site: everything that is about the website rather than the person.
 * ------------------------------------------------------------------------- */
export const site = {
  /** your domain, with a trailing slash. Used for canonical, OG tags and sitemap. */
  url: "https://example.com/",
  title: `${profile.name} · ${profile.role}`,
  description:
    "Amara Nwosu is an Earth Observation Data Scientist in Nairobi who builds crop, flood and land cover maps from satellite imagery.",
  lang: "en",
  locale: "en_US",
  themeColor: "#02040b",
  /** put your PDF in public/ and point to it here */
  resume: "/Resume.pdf",
  ogImage: "/og.png",
  ogImageAlt: "Amara Nwosu, set over a night-side Earth seen from orbit",
  /** shown in the footer. Delete the text (empty string) once the site is yours. */
  footerNote: "Sample portfolio. The person, companies and projects are fictional.",
  /** short tag after the concept name in the hero and loader */
  tagline: "Earth observation portfolio",
  /** social links: shown in the contact panel, the command palette and JSON-LD (when not "#") */
  socials: [
    { label: "LinkedIn", href: "#" },
    { label: "GitHub", href: "#" },
    { label: "X", href: "#" },
  ],
  /** optional Twitter/X handle for twitter:site, without @. Leave empty to omit. */
  twitter: "",
  /**
   * Where the descent lands. The globe camera path, the sun, scan passes, loader
   * globe, ground track, HUD telemetry, pins, arcs, labels, the ground and the
   * beacon are all placed relative to these coordinates, so any city works.
   * lat and lon are decimal degrees; south and west are negative.
   */
  home: {
    city: "Nairobi",
    country: "Kenya",
    /** ISO 3166 code for JSON-LD */
    countryCode: "KE",
    lat: -1.2921,
    lon: 36.8219,
    timezone: "EAT, UTC+3",
    /** finishes the re-entry line: "The next passes are flown low, over ..." */
    surroundings: "the highlands around the city",
    /** the low-altitude ground around the city, after the re-entry. See README, "Set your home city". */
    terrain: {
      /** compass bearing (degrees) of the hills that rise beyond the city: 0 north, 90 east, 180 south, 270 west. null for none */
      ridgeBearing: 235 as number | null,
      /** flat-topped steps in the land, like an old lava plateau */
      terraced: true,
      /** a river winding west to east through the city */
      river: true,
      /** height of the land: 0 flat, 1 rolling, 2 mountainous */
      relief: 1,
      /** compass bearing of the sea for a coastal city (Lisbon 225, Sydney 90), null for inland, "auto" to guess from the map */
      coast: "auto" as number | null | "auto",
    },
  },
  /** optional extra words for the agent's retrieval: a visitor's word -> words found in your content */
  agentSynonyms: {
    flood: ["water", "radar", "rainline"],
    floods: ["water", "radar", "rainline"],
    crop: ["crops", "agriculture", "smallholder"],
    farming: ["crop", "agriculture", "smallholder"],
    satellite: ["imagery", "radar", "optical", "remote"],
    radar: ["sar"],
    mapping: ["map", "segmentation", "land"],
  } as Record<string, string[]>,
};

/* ---------------------------------------------------------------------------
 * experience: newest first. The first entry is highlighted.
 * ------------------------------------------------------------------------- */
export type Experience = {
  role: string;
  org: string;
  place: string;
  start: string;
  end: string;
  points: string[];
};

export const experience: Experience[] = [
  {
    role: "Earth Observation Data Scientist",
    org: "Mbuni Earth Analytics",
    place: "Nairobi",
    start: "Mar 2023",
    end: "Present",
    points: [
      "Lead modelling for Rainline, which maps flood extent and crop condition for 14 county governments and two crop insurers.",
      "Built the radar flood segmentation model that cut pass-to-map time from two days to a median of 3.5 hours.",
      "Run a field validation program with 30 enumerators, turning their GPS checks into a held-out test set that every release must beat.",
      "Mentor three junior analysts on model evaluation, label quality and writing maps up for non-specialists.",
    ],
  },
  {
    role: "Data Scientist, Remote Sensing",
    org: "Greenrow Agritech",
    place: "Nairobi",
    start: "Jun 2020",
    end: "Feb 2023",
    points: [
      "Built crop type and field boundary models for smallholder plots under one hectare across western Kenya.",
      "Designed the drought stress index behind a farm advisory SMS service used by about 90,000 farmers.",
    ],
  },
  {
    role: "GIS and Remote Sensing Analyst",
    org: "Lakeshore Water Trust",
    place: "Kisumu",
    start: "Jan 2018",
    end: "May 2020",
    points: [
      "Mapped 24 years of shoreline and papyrus wetland change around the lake for a conservation program.",
      "Trained county staff to run the water mapping workflow themselves in open source GIS tools.",
    ],
  },
];

/* ---------------------------------------------------------------------------
 * education: the first entry is shown in the About panel; all are used by the agent.
 * ------------------------------------------------------------------------- */
export type Education = { degree: string; school: string; place: string; start: string; end: string; note?: string };

export const education: Education[] = [
  {
    degree: "MSc, Geospatial Data Science",
    school: "Baobab Coast University",
    place: "Mombasa",
    start: "Sep 2016",
    end: "Dec 2017",
    note: "Thesis on mapping mangrove loss from radar time series. Graduated with distinction.",
  },
  {
    degree: "BSc, Geomatic Engineering",
    school: "Baobab Coast University",
    place: "Mombasa",
    start: "Sep 2011",
    end: "Jul 2015",
  },
];

/* ---------------------------------------------------------------------------
 * Project classes. Each project belongs to one class; the classes double as
 * the legend of the segmentation mask painted on the globe and the ground.
 * `tone` picks one of the four class colours (CSS --c-1 .. --c-4 in
 * src/styles.css, mirrored for WebGL in src/world/palette.ts):
 *   1 water blue, 2 vegetation green, 3 built-up amber, 4 slope red.
 * Add, rename or remove classes freely; tones may repeat.
 * ------------------------------------------------------------------------- */
export const projectClasses = [
  { name: "Water & floods", tone: 1 },
  { name: "Crops & vegetation", tone: 2 },
  { name: "Land cover & urban", tone: 3 },
  { name: "Pipelines & tools", tone: 4 },
] as const;

export type Category = (typeof projectClasses)[number]["name"];

export type Project = {
  title: string;
  summary: string;
  detail: string;
  category: Category;
  stack: string[];
  /** one headline number. Keep it honest: only numbers you can stand behind. */
  metric?: { value: string; label: string };
  year: string;
  links?: { label: string; href: string }[];
  /** small tag next to the title, e.g. "Published". "Best Paper" gets the award colour. */
  badge?: string;
  /** optional one-line aside shown under the detail */
  aside?: string;
};

/* ---------------------------------------------------------------------------
 * featured: the flagship system. `parts` are the pieces of the system; they fly
 * in formation around the satellite in the 3D scene (2 to 6 work best).
 * ------------------------------------------------------------------------- */
export const featured = {
  title: "Rainline",
  /** short name for the nav and palette; defaults to title */
  navLabel: "Rainline",
  tagline: "Every satellite pass becomes a flood and crop map a county officer can use the same day.",
  description:
    "Rainline is the monitoring service I lead at Mbuni. Each new radar or optical scene over a client county runs through four stages: it is ingested and tiled, segmented into water, cropland, built-up and bare ground, compared against a seasonal baseline, and turned into an alert with a map and a plain-language summary.",
  parts: [
    { name: "Ingest", role: "Pulls each new radar and optical scene, masks cloud and shadow, and tiles it onto one 10 m grid." },
    { name: "Segment", role: "A U-Net with a temporal encoder labels water, cropland, built-up and bare ground for every pixel." },
    { name: "Change", role: "Compares the new mask with a seasonal baseline to find fresh flooding and crop loss, not just wet fields." },
    { name: "Alert", role: "Sends county officers a map and a short written summary, ranked by people and hectares affected." },
  ],
  facts: [
    "Covers 14 counties, about 210,000 km²",
    "Median 3.5 hours from satellite pass to alert",
    "Flood extent F1 of 0.91 against field surveys",
  ],
  stack: ["Python", "PyTorch", "xarray", "Dask", "PostGIS", "FastAPI"],
  links: [{ label: "Read the case study", href: "#" }],
};

export const projects: Project[] = [
  {
    title: "Flood Extent from Radar",
    summary: "Segments open and vegetated flood water from radar scenes, through cloud, during the long rains.",
    detail:
      "A U-Net trained on 6,200 hand-checked radar tiles, with a height-above-drainage layer so shadows on hillsides stop looking like water. It is the core model inside Rainline.",
    category: "Water & floods",
    stack: ["PyTorch", "U-Net", "rasterio", "GDAL"],
    metric: { value: "0.91", label: "flood F1 vs field surveys" },
    year: "2024",
    badge: "Best Paper",
    links: [{ label: "Paper", href: "#" }],
  },
  {
    title: "Smallholder Crop Type Mapping",
    summary: "Classifies maize, beans, sorghum, tea, sugarcane and grassland on plots smaller than one hectare.",
    detail:
      "A temporal attention model reads a full season of 5-day optical composites per pixel, then votes per field. Trained on 18,000 labelled fields from three seasons.",
    category: "Crops & vegetation",
    stack: ["PyTorch", "Transformers", "xarray"],
    metric: { value: "84%", label: "accuracy over 6 classes" },
    year: "2023",
    badge: "Published",
    links: [{ label: "Code", href: "#" }],
  },
  {
    title: "Field Boundary Delineation",
    summary: "Draws the edges of small farm fields from 3 m imagery so crop maps can be read per field.",
    detail:
      "A multi-task network predicts field extent, boundary and distance to edge, then a watershed step turns them into polygons. It produced 1.2 million field outlines across western Kenya.",
    category: "Crops & vegetation",
    stack: ["PyTorch", "scikit-image", "Shapely"],
    metric: { value: "0.81", label: "boundary F1" },
    year: "2022",
  },
  {
    title: "Drought Stress Early Warning",
    summary: "Forecasts vegetation condition six weeks ahead from greenness, rainfall and soil moisture time series.",
    detail:
      "Gradient boosted models per agro-ecological zone, with SHAP summaries so advisors can see whether rain or heat is driving a warning. Feeds a farm advisory SMS service.",
    category: "Crops & vegetation",
    stack: ["LightGBM", "SHAP", "pandas"],
    metric: { value: "6 weeks", label: "forecast lead time" },
    year: "2022",
  },
  {
    title: "Settlement Growth Tracker",
    summary: "Finds new roofs and roads between yearly 50 cm image mosaics for county planning teams.",
    detail:
      "A siamese change detection network compares co-registered image pairs and flags new structures, which planners review in a simple web map before updating their records.",
    category: "Land cover & urban",
    stack: ["PyTorch", "Siamese U-Net", "Leaflet"],
    metric: { value: "92%", label: "precision on new structures" },
    year: "2024",
  },
  {
    title: "Rift Basin Land Cover Map",
    summary: "An annual 10-class land cover map at 10 m for a river basin authority.",
    detail:
      "Random forest and a small CNN ensemble, with active learning to pick the next 500 points worth labelling. Accuracy is reported with area-adjusted confidence intervals, not just a single number.",
    category: "Land cover & urban",
    stack: ["scikit-learn", "PyTorch", "QGIS"],
    metric: { value: "88%", label: "overall accuracy" },
    year: "2023",
  },
  {
    title: "Wetland Change Atlas",
    summary: "Twenty-four years of shoreline and papyrus wetland change around the lake, mapped year by year.",
    detail:
      "Water and wetland classification on a long archive of medium resolution imagery, with a temporal smoothing step that removes one-year flickers before computing change.",
    category: "Water & floods",
    stack: ["Python", "scikit-learn", "GDAL"],
    metric: { value: "24 yrs", label: "of yearly maps" },
    year: "2020",
    aside: "The water class on this descent's mask is a nod to this project.",
  },
  {
    title: "Cloud Gap Filling",
    summary: "Fills cloudy pixels in optical time series using radar and the pixels' own history.",
    detail:
      "A small sequence model learns the mapping from radar backscatter and neighbouring dates to optical reflectance, so crop models still get a usable series in the rainy season.",
    category: "Pipelines & tools",
    stack: ["PyTorch", "xarray", "Dask"],
    metric: { value: "41% to 86%", label: "usable dates per season" },
    year: "2023",
  },
  {
    title: "Patchwork Label Tool",
    summary: "An offline-first labelling app that field teams use on tablets with no signal.",
    detail:
      "Enumerators see the image patch, the model's guess and their GPS position, then confirm or correct the class. Labels sync when the tablet finds a connection.",
    category: "Pipelines & tools",
    stack: ["TypeScript", "IndexedDB", "FastAPI"],
    metric: { value: "46,000", label: "field labels collected" },
    year: "2024",
    links: [{ label: "Code", href: "#" }],
  },
  {
    title: "Scene Quality Gate",
    summary: "Automatic checks that stop bad scenes before they reach a model.",
    detail:
      "Checks geolocation drift against reference tiles, residual cloud, striping and missing bands, and writes a short reason for every rejected scene so operators can trust the gate.",
    category: "Pipelines & tools",
    stack: ["Python", "rasterio", "Airflow"],
    metric: { value: "97%", label: "of bad scenes caught" },
    year: "2024",
  },
];

/* ---------------------------------------------------------------------------
 * publications and talks. The section hides itself when this list is empty.
 * `geo` puts a pin on the globe and flies an arc to it from your home city;
 * leave it out for journals or online talks.
 * ------------------------------------------------------------------------- */
export type Publication = {
  title: string;
  venue: string;
  where: string;
  publisher: string;
  year: string;
  note?: string;
  award?: boolean;
  /** award label when award is true; defaults to "Best Paper" */
  awardLabel?: string;
  geo?: { city: string; lat: number; lon: number };
};

export const publications: Publication[] = [
  {
    title: "Same-Day Flood Mapping for County Response with Radar Segmentation",
    venue: "ERSC-2025",
    where: "Equatorial Remote Sensing Conference",
    publisher: "ERSC Proceedings",
    year: "2025",
    award: true,
    note: "Best Paper Award",
    geo: { city: "Cape Town", lat: -33.92, lon: 18.42 },
  },
  {
    title: "Temporal Attention for Crop Type Mapping on Smallholder Plots",
    venue: "JAEI",
    where: "Journal article",
    publisher: "Journal of Applied Earth Imaging",
    year: "2024",
  },
  {
    title: "Spending a Label Budget Wisely: Land Cover in Data-Poor Regions",
    venue: "Open Map Week 2024",
    where: "Invited talk",
    publisher: "Open Map Week",
    year: "2024",
    geo: { city: "Accra", lat: 5.6, lon: -0.19 },
  },
  {
    title: "Twenty-Four Years of Wetland Loss on a Great Lake Shore",
    venue: "SIWO-2021",
    where: "Symposium on Inland Water Observation",
    publisher: "SIWO Proceedings",
    year: "2021",
    geo: { city: "Lisbon", lat: 38.72, lon: -9.14 },
  },
];

export const skills: { group: string; items: string[] }[] = [
  {
    group: "Remote sensing",
    items: ["Radar (SAR) processing", "Optical time series", "Cloud masking", "Change detection", "Accuracy assessment", "Field validation"],
  },
  {
    group: "Machine learning",
    items: ["PyTorch", "U-Net and segmentation", "Temporal attention", "Siamese networks", "scikit-learn", "LightGBM", "Active learning"],
  },
  {
    group: "Geospatial data",
    items: ["GDAL", "rasterio", "xarray", "Dask", "PostGIS", "QGIS", "Cloud optimised rasters", "STAC catalogues"],
  },
  {
    group: "Engineering",
    items: ["Python", "SQL", "FastAPI", "Airflow", "Docker", "TypeScript", "Git"],
  },
];

/* `badge` is an optional short tag shown next to the certificate name */
export const certifications: { name: string; issuer: string; date: string; badge?: string }[] = [
  { name: "Advanced Radar Image Processing", issuer: "Geodata Academy", date: "Mar 2024", badge: "Radar" },
  { name: "Cloud Native Geospatial Pipelines", issuer: "Open Raster Institute", date: "Aug 2023" },
  { name: "Deep Learning for Imagery", issuer: "Lumen ML School", date: "Nov 2021" },
  { name: "Registered Geomatic Engineer", issuer: "Board of Survey Professionals", date: "Jun 2017" },
];
