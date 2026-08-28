import {
  BlobServiceClient,
  ContainerClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import type { Response } from "express";
import { propertiesService } from "./propertiesService";

const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50MB

let containerClient: ContainerClient | null = null;
let resolvedContainerName: string = "";

async function getContainerClient(): Promise<{ client: ContainerClient; containerName: string }> {
  if (!containerClient) {
    const connectionString = (await propertiesService.get('AZURE_STORAGE_CONNECTION_STRING', process.env.AZURE_STORAGE_CONNECTION_STRING || '')).trim();
    const containerName = (await propertiesService.get('AZURE_STORAGE_CONTAINER_NAME', process.env.AZURE_STORAGE_CONTAINER_NAME || 'prokraya-files')).trim();

    if (!connectionString) {
      throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set in environment variables or am_property_mst");
    }
    if (!connectionString.includes("AccountName=") && !connectionString.includes("BlobEndpoint=")) {
      throw new Error("AZURE_STORAGE_CONNECTION_STRING appears to be malformed (missing AccountName or BlobEndpoint)");
    }
    try {
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      containerClient = blobServiceClient.getContainerClient(containerName);
      resolvedContainerName = containerName;
    } catch (err: any) {
      throw new Error(`Failed to initialize Azure Blob Storage client: ${err.message}. Check AZURE_STORAGE_CONNECTION_STRING.`);
    }
  }
  return { client: containerClient, containerName: resolvedContainerName };
}

/**
 * Ensures the container exists (creates it if not). Call once at startup.
 */
export async function initAzureBlobContainer(): Promise<void> {
  const { client } = await getContainerClient();
  await client.createIfNotExists();
}

/**
 * Uploads a file buffer to Azure Blob Storage.
 * @param buffer    File content as Buffer
 * @param folder    Logical folder/prefix (e.g. "SUPPLIERS/7", "INVOICES/123")
 * @param filename  Sanitized filename (e.g. "invoice_001.pdf")
 * @param mimeType  MIME type of the file
 * @param tenant    Tenant domain/name (e.g. "acme"). Used as root folder for multi-tenant isolation.
 * @returns         Full URL of the uploaded blob
 */
const UPLOAD_TIMEOUT_MS = 60000; // 60s — avoids indefinite hang when Azure is slow

export async function uploadFileToAzure(
  buffer: Buffer,
  folder: string,
  filename: string,
  mimeType: string,
  tenant?: string
): Promise<string> {
  const { client } = await getContainerClient();
  const tenantPrefix = tenant ? `${tenant}/` : "shared/";
  const blobName = `${tenantPrefix}${folder}/${Date.now()}_${filename}`;
  const blockBlobClient = client.getBlockBlobClient(blobName);

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), UPLOAD_TIMEOUT_MS);

  try {
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: mimeType },
      abortSignal: abortController.signal,
    });
  } catch (err: any) {
    if (err.name === "AbortError" || abortController.signal.aborted) {
      throw { status: 504, message: "File upload to storage timed out. Please try again." };
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  return blockBlobClient.url;
}

/**
 * Deletes a blob by its full URL or blob name (path within container).
 * @param blobUrlOrName  Full Azure blob URL or relative blob name (folder/filename)
 */
export async function deleteFileFromAzure(blobUrlOrName: string): Promise<void> {
  const { client, containerName } = await getContainerClient();

  // Extract blob name from full URL if needed
  let blobName = blobUrlOrName;
  if (blobUrlOrName.startsWith("https://")) {
    const url = new URL(blobUrlOrName);
    // URL path is /<container>/<blobName>
    blobName = url.pathname.replace(`/${containerName}/`, "");
  }

  const blockBlobClient = client.getBlockBlobClient(blobName);
  await blockBlobClient.deleteIfExists();
}

/**
 * Generates a short-lived SAS URL for private blobs (read-only, expires in given minutes).
 * Use this if your container is NOT set to public access.
 * @param blobUrl    Full Azure blob URL
 * @param expiryMins How many minutes the SAS URL should be valid (default: 60)
 * @returns          SAS URL string
 */
export async function getSignedUrl(blobUrl: string, expiryMins = 60): Promise<string> {
  const connectionString = (await propertiesService.get('AZURE_STORAGE_CONNECTION_STRING', process.env.AZURE_STORAGE_CONNECTION_STRING || '')).trim();
  const { containerName } = await getContainerClient();

  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  }

  // Parse account name and key from connection string
  const accountNameMatch = connectionString.match(/AccountName=([^;]+)/);
  const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/);

  if (!accountNameMatch || !accountKeyMatch) {
    throw new Error("Could not parse Azure Storage credentials from connection string");
  }

  const accountName = accountNameMatch[1];
  const accountKey = accountKeyMatch[1];

  const url = new URL(blobUrl);
  const blobName = url.pathname.replace(`/${containerName}/`, "");

  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
  const expiresOn = new Date(Date.now() + expiryMins * 60 * 1000);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse("r"),
      expiresOn,
    },
    sharedKeyCredential
  ).toString();

  return `${blobUrl}?${sasToken}`;
}

/**
 * Streams a blob directly to an Express response — memory efficient, no buffering.
 * Use this for all single-file download routes.
 * @param blobUrl   Full Azure blob URL
 * @param res       Express response object to pipe into
 */
export async function streamFileFromAzure(blobUrl: string, res: Response): Promise<void> {
  const { client, containerName } = await getContainerClient();
  const url = new URL(blobUrl);
  const blobName = url.pathname.replace(`/${containerName}/`, "");
  const blockBlobClient = client.getBlockBlobClient(blobName);

  // Check file size before streaming
  const properties = await blockBlobClient.getProperties();
  const fileSize = properties.contentLength ?? 0;
  if (fileSize > MAX_DOWNLOAD_SIZE) {
    throw { status: 413, message: `File size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds the ${MAX_DOWNLOAD_SIZE / (1024 * 1024)}MB download limit` };
  }

  const downloadResponse = await blockBlobClient.download(0);
  if (!downloadResponse.readableStreamBody) {
    throw { status: 500, message: "Failed to get file stream from storage" };
  }

  await new Promise<void>((resolve, reject) => {
    downloadResponse.readableStreamBody!.pipe(res)
      .on("finish", resolve)
      .on("error", reject);
  });
}

/**
 * Downloads a blob as a Buffer — only use when a Buffer is strictly required (e.g. zip archives).
 * Enforces a size limit to prevent memory exhaustion.
 * @param blobUrl  Full Azure blob URL
 */
export async function downloadFileFromAzure(blobUrl: string): Promise<Buffer> {
  const { client, containerName } = await getContainerClient();
  const url = new URL(blobUrl);
  const blobName = url.pathname.replace(`/${containerName}/`, "");
  const blockBlobClient = client.getBlockBlobClient(blobName);

  // Enforce size limit before buffering
  const properties = await blockBlobClient.getProperties();
  const fileSize = properties.contentLength ?? 0;
  if (fileSize > MAX_DOWNLOAD_SIZE) {
    throw { status: 413, message: `File size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds the ${MAX_DOWNLOAD_SIZE / (1024 * 1024)}MB download limit` };
  }

  return blockBlobClient.downloadToBuffer();
}
