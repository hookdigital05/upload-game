// src/app/api/history/route.ts
import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export async function GET() {
  try {
    // Tentukan path ke file history.json
    const jsonDirectory = path.join(process.cwd(), "src", "data");
    // Baca file
    const fileContents = await fs.readFile(
      path.join(jsonDirectory, "history.json"),
      "utf8"
    );
    // Kirim kontennya sebagai response
    return NextResponse.json(JSON.parse(fileContents));
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Gagal memuat data riwayat." },
      { status: 500 }
    );
  }
}
