export type ExampleModel = { id: string; name: string; parts: number; downloadLabel: string; url: string; thumbnail: string };

export const EXAMPLE_MODELS: ExampleModel[] = [
  { id: "wood-house", name: "Wood House", parts: 18, downloadLabel: "0.1 MB", url: "/examples/wood-house.glb.gz", thumbnail: "/examples/wood-house.png" },
  { id: "press-manufacturing-line", name: "Press Manufacturing Line", parts: 32, downloadLabel: "5.6 MB", url: "/examples/press-manufacturing-line.glb.gz", thumbnail: "/examples/press-manufacturing-line.png" },
  { id: "car-production-line", name: "Car Production Line", parts: 30, downloadLabel: "14.7 MB", url: "/examples/car-production-line.glb.gz", thumbnail: "/examples/car-production-line.png" },
];

export async function decodeExample(bytes: Uint8Array): Promise<ArrayBuffer> {
  let buffer = new Uint8Array(bytes).buffer;
  // Some hosts decode Content-Encoding automatically; accept either exact form.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  const header = new DataView(buffer);
  if (buffer.byteLength < 12 || header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== buffer.byteLength) {
    throw new Error("The example download is incomplete or invalid.");
  }
  return buffer;
}

export async function readExampleFile(example: ExampleModel, progress: (message: string) => void): Promise<File> {
  progress(`Downloading ${example.name}…`);
  const response = await fetch(example.url);
  if (!response.ok || !response.body) throw new Error(`Example unavailable (${response.status}).`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); loaded += value.byteLength;
    progress(`Downloading ${example.name} · ${(loaded / 1e6).toFixed(1)} MB`);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  progress(`Opening ${example.name}…`);
  const buffer = await decodeExample(bytes);
  return new File([buffer], `${example.name}.glb`, { type: "model/gltf-binary" });
}
