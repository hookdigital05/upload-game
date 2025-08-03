"use client";

import { useGoogleLogin } from "@react-oauth/google";
import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";

// Tipe data untuk status upload
type UploadStatus = "pending" | "uploading" | "success" | "skipped" | "error";

// Tipe data untuk setiap file yang akan diupload
interface UploadableFile {
  id: string;
  file: File;
  status: UploadStatus;
  message?: string;
}

// Tipe data untuk Riwayat
interface IHistory {
  _id: string;
  gameName: string;
  driveLink: string;
  uploadDate: string;
}

export default function HomePage() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [uploadableFiles, setUploadableFiles] = useState<UploadableFile[]>([]);
  const [history, setHistory] = useState<IHistory[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // State untuk Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5); // Tampilkan 5 item per halaman

  useEffect(() => {
    setIsMounted(true);
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setHistory(data);
        } else {
          setHistory([]);
        }
      }
    } catch (error) {
      console.error("Gagal memuat riwayat:", error);
      setHistory([]);
    }
  };

  const login = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/drive.file",
    onSuccess: (tokenResponse) => setAccessToken(tokenResponse.access_token),
    onError: () => alert("Login Gagal"),
  });

  const updateFileStatus = (
    id: string,
    status: UploadStatus,
    message?: string
  ) => {
    setUploadableFiles((prevFiles) =>
      prevFiles.map((f) => (f.id === id ? { ...f, status, message } : f))
    );
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadableFile[] = acceptedFiles.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      file: file,
      status: "pending",
    }));
    setUploadableFiles((prevFiles) => [...prevFiles, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/zip": [".zip"] },
  });

  const handleUpload = async () => {
    if (uploadableFiles.length === 0) return;
    if (!accessToken) {
      alert("Anda harus login terlebih dahulu.");
      return;
    }

    setIsUploading(true);

    for (const uFile of uploadableFiles) {
      if (uFile.status !== "pending") continue;

      updateFileStatus(uFile.id, "uploading", "Mengirim...");

      const formData = new FormData();
      formData.append("file", uFile.file);

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData,
        });

        const result = await res.json();

        if (res.status === 201) {
          updateFileStatus(uFile.id, "success", "✓ Berhasil");
        } else if (res.status === 409) {
          updateFileStatus(uFile.id, "skipped", `✓ Dilewati (sudah ada)`);
        } else {
          throw new Error(result.error || "Gagal diupload");
        }
      } catch (error: any) {
        updateFileStatus(uFile.id, "error", `✗ Gagal: ${error.message}`);
      }
    }

    setIsUploading(false);
    fetchHistory();
  };

  const removeFile = (id: string) => {
    setUploadableFiles((prevFiles) => prevFiles.filter((f) => f.id !== id));
  };

  // Logika untuk data di halaman saat ini
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = history.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(history.length / itemsPerPage);

  // --- FUNGSI BARU: LOGIKA UNTUK MEMBUAT TOMBOL PAGINATION YANG RINGKAS ---
  const getPaginationItems = () => {
    const siblingCount = 1; // Jumlah halaman di kiri dan kanan halaman aktif
    const totalPageNumbers = siblingCount + 5; // Total item pagination yang ditampilkan

    if (totalPageNumbers >= totalPages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
    const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

    const shouldShowLeftDots = leftSiblingIndex > 2;
    const shouldShowRightDots = rightSiblingIndex < totalPages - 1;

    const firstPageIndex = 1;
    const lastPageIndex = totalPages;

    if (!shouldShowLeftDots && shouldShowRightDots) {
      let leftItemCount = 3 + 2 * siblingCount;
      let leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
      return [...leftRange, "...", totalPages];
    }

    if (shouldShowLeftDots && !shouldShowRightDots) {
      let rightItemCount = 3 + 2 * siblingCount;
      let rightRange = Array.from(
        { length: rightItemCount },
        (_, i) => totalPages - rightItemCount + 1 + i
      );
      return [firstPageIndex, "...", ...rightRange];
    }

    if (shouldShowLeftDots && shouldShowRightDots) {
      let middleRange = Array.from(
        { length: rightSiblingIndex - leftSiblingIndex + 1 },
        (_, i) => leftSiblingIndex + i
      );
      return [firstPageIndex, "...", ...middleRange, "...", lastPageIndex];
    }

    return []; // Fallback
  };

  const paginationItems = getPaginationItems();

  const paginate = (pageNumber: number) => {
    if (pageNumber > 0 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
    }
  };

  return (
    <main className="container mx-auto p-4 md:p-8 font-sans">
      <header className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-800">
          Hook Digital Upload Game
        </h1>
        <div className="mt-8 flex justify-center items-center min-h-[40px]">
          {isMounted && !accessToken && (
            <button
              onClick={() => login()}
              className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
            >
              🚀 Login dengan Google
            </button>
          )}
          {isMounted && accessToken && (
            <p className="text-green-600 font-semibold">
              Anda sudah login! Silakan mulai mengupload.
            </p>
          )}
        </div>
      </header>

      {/* Bagian Upload */}
      {isMounted && accessToken && (
        <section className="max-w-xl mx-auto bg-white p-8 rounded-lg shadow-lg mb-12">
          {/* ... kode dropzone, daftar file, dan tombol upload sama seperti sebelumnya ... */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-green-500 bg-green-50"
                : "border-gray-300 hover:border-blue-500"
            }`}
          >
            <input {...getInputProps()} />
            <p className="text-gray-500">
              Tarik & lepaskan file .zip di sini, atau klik untuk memilih file
            </p>
          </div>

          {uploadableFiles.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold text-gray-700">
                Daftar Proses Upload:
              </h3>
              <div className="space-y-2 mt-2 max-h-60 overflow-y-auto pr-2">
                {uploadableFiles.map((uFile) => {
                  const statusStyles = {
                    pending: "bg-gray-100",
                    uploading: "bg-blue-100 animate-pulse",
                    success: "bg-green-100",
                    skipped: "bg-yellow-100",
                    error: "bg-red-100",
                  };
                  const statusTextStyles = {
                    pending: "text-gray-500",
                    uploading: "text-blue-600 font-semibold",
                    success: "text-green-600 font-semibold",
                    skipped: "text-yellow-700 font-semibold",
                    error: "text-red-600 font-semibold",
                  };

                  return (
                    <div
                      key={uFile.id}
                      className={`flex items-center justify-between p-2 rounded-md ${
                        statusStyles[uFile.status]
                      }`}
                    >
                      <p className="text-sm text-gray-800 truncate pr-2">
                        {uFile.file.name}
                      </p>
                      <div className="flex items-center">
                        <span
                          className={`text-xs mr-3 ${
                            statusTextStyles[uFile.status]
                          }`}
                        >
                          {uFile.message ||
                            uFile.status.charAt(0).toUpperCase() +
                              uFile.status.slice(1)}
                        </span>
                        <button
                          onClick={() => removeFile(uFile.id)}
                          disabled={isUploading}
                          className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6">
            <button
              onClick={handleUpload}
              disabled={isUploading || uploadableFiles.length === 0}
              className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading
                ? "Sedang Memproses..."
                : `Upload ${
                    uploadableFiles.filter((f) => f.status === "pending").length
                  } File`}
            </button>
          </div>
        </section>
      )}

      {/* Bagian Riwayat Upload */}
      {isMounted && accessToken && history.length > 0 && (
        <section>
          <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">
            Riwayat Upload
          </h2>
          <div className="overflow-x-auto bg-white rounded-lg shadow-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nama Game
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Link Google Drive
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tanggal Upload
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentItems.map((item) => (
                  <tr key={item._id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.gameName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 hover:underline">
                      <a
                        href={item.driveLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Lihat File
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(item.uploadDate).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* --- UI PAGINATION BARU YANG LEBIH RINGKAS --- */}
          {totalPages > 1 && (
            <nav className="flex justify-center items-center mt-6 space-x-1">
              <button
                onClick={() => paginate(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm font-medium text-gray-600 bg-white rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              {paginationItems.map((item, index) => {
                if (item === "...") {
                  return (
                    <span
                      key={index}
                      className="px-3 py-1 text-sm text-gray-500"
                    >
                      ...
                    </span>
                  );
                }
                return (
                  <button
                    key={index}
                    onClick={() => paginate(item as number)}
                    className={`px-3 py-1 text-sm font-medium rounded-md ${
                      currentPage === item
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
              <button
                onClick={() => paginate(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm font-medium text-gray-600 bg-white rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </nav>
          )}
        </section>
      )}
    </main>
  );
}
