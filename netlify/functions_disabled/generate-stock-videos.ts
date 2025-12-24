import type { Handler } from "@netlify/functions";

type IncomingBody = {
  vibePrompt?: string;
  videoStyleId?: string;
  duration?: number;
};

const DEMO_CLIPS = [
  {
    id: "demo-1",
    url:
      "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    thumbnail:
      "https://images.pexels.com/photos/799443/pexels-photo-799443.jpeg?auto=compress&cs=tinysrgb&w=640",
    duration: 8,
  },
  {
    id: "demo-2",
    url: "https://www.w3schools.com/html/mov_bbb.mp4",
    thumbnail:
      "https://images.pexels.com/photos/854149/pexels-photo-854149.jpeg?auto=compress&cs=tinysrgb&w=640",
    duration: 10,
  },
  {
    id: "demo-3",
    url:
      "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    thumbnail:
      "https://images.pexels.com/photos/34088/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=640",
    duration: 6,
  },
  {
    id: "demo-4",
    url: "https://www.w3schools.com/html/mov_bbb.mp4",
    thumbnail:
      "https://images.pexels.com/photos/799443/pexels-photo-799443.jpeg?auto=compress&cs=tinysrgb&w=640",
    duration: 9,
  },
  {
    id: "demo-5",
    url:
      "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    thumbnail:
      "https://images.pexels.com/photos/854149/pexels-photo-854149.jpeg?auto=compress&cs=tinysrgb&w=640",
    duration: 7,
  },
];

const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Empty request body." }),
      };
    }

    const body: IncomingBody = JSON.parse(event.body);
    const vibePrompt = (body.vibePrompt || "").trim();
    const videoStyleId = body.videoStyleId || "";
    const duration = body.duration || 15;

    const styleQueries: Record<string, string> = {
      "ghoste-motion": "dark city neon lights moody street driving",
      "ghoste-spotlight":
        "stage spotlight cinematic artist silhouette performance",
      "night-city": "night city neon lights driving at night",
      "sunset-dream": "sunset golden hour dreamy slow motion",
      "studio-session": "music recording studio artist microphone",
      "gritty-street": "gritty street urban city handheld",
      "soft-rnb": "soft lights romantic reflections",
      "hyper-pop": "colorful glitch fast motion",
      "moody-forest": "foggy forest moody nature",
      "party-club": "club party crowd lights dancing",
      "aerial-vibes": "drone aerial cityscape skyline",
      "lofi-bedroom": "cozy bedroom lofi aesthetic",
    };

    const base =
      styleQueries[videoStyleId] || "music video b roll aesthetic moody";
    const fullQuery = `${base} ${vibePrompt}`.trim();

    const apiKey = process.env.PEXELS_API_KEY;

    if (!apiKey) {
      console.warn("PEXELS_API_KEY missing – returning demo clips.");
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clips: DEMO_CLIPS,
          source: "demo",
          note: "PEXELS_API_KEY missing, using demo clips.",
        }),
      };
    }

    const params = new URLSearchParams({
      query: fullQuery,
      per_page: "9",
      orientation: "portrait",
      size: "medium",
    });

    const response = await fetch(
      `https://api.pexels.com/videos/search?${params.toString()}`,
      {
        headers: {
          Authorization: apiKey,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Pexels error:", response.status, text);
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clips: DEMO_CLIPS,
          source: "demo",
          note: "Pexels failed, using demo clips.",
        }),
      };
    }

    const json = await response.json();

    const clips =
      (json.videos || []).map((v: any) => {
        const files = v.video_files || [];
        const file =
          files.find((f: any) => f.height >= f.width) ||
          files.find((f: any) => f.quality === "sd") ||
          files[0];

        return {
          id: String(v.id),
          url: file?.link || "",
          thumbnail: v.image || "",
          duration: v.duration || duration,
        };
      }) || [];

    const filtered = clips.filter((c) => c.url && c.thumbnail);

    if (!filtered.length) {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clips: DEMO_CLIPS,
          source: "demo",
          note: "No Pexels matches, using demo clips.",
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clips: filtered,
        source: "pexels",
        query: fullQuery,
      }),
    };
  } catch (err) {
    console.error("Unexpected error in generate-stock-videos:", err);
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clips: DEMO_CLIPS,
        source: "demo",
        note: "Unexpected error, using demo clips.",
      }),
    };
  }
};

export { handler };
