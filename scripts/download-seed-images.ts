import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
const images: Record<string, string> = {
  restaurant: "photo-1517248135467-4c7edcad34c4",
  paneer: "photo-1567188040759-fb8a883dc6d8",
  chicken: "photo-1527477396000-e27163b481c2",
  butterchicken: "photo-1603894584373-5ac82b2ae398",
  dal: "photo-1546833999-b9f581a1996d",
  biryani: "photo-1563379091339-03b21ab4a4f8",
  vegetablebiryani: "photo-1642821373181-696a54913e93",
  naan: "photo-1631452180519-c014fe946bc7",
  lassi: "photo-1546173159-315724a31696",
  coke: "photo-1622483767028-3f66f32aef97",
  dessert: "photo-1616429266392-63ba6f1570a1",
};
await mkdir("public/images", { recursive: true });
for (const [name, id] of Object.entries(images)) {
  try {
    const response = await fetch(
      `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1000&q=85`,
    );
    if (!response.ok) throw new Error(String(response.status));
    const bytes = await sharp(Buffer.from(await response.arrayBuffer()))
      .webp({ quality: 85 })
      .toBuffer();
    await writeFile(`public/images/${name}.webp`, bytes);
    console.log(`Saved ${name}`);
  } catch (e) {
    console.log(`Failed ${name}: ${String(e)}`);
  }
}
