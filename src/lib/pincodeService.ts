export interface PostOfficeDetail {
  Name: string;
  Description: string | null;
  BranchType: string;
  DeliveryStatus: string;
  Circle: string;
  District: string;
  Division: string;
  Region: string;
  State: string;
  Country: string;
  Pincode: string;
}

export interface PincodeApiResponse {
  Message: string;
  Status: 'Success' | 'Error';
  PostOffice: PostOfficeDetail[] | null;
}

/**
 * Fetches location details for a given Indian PIN code.
 * @param pincode 6-digit numeric PIN code string
 * @param timeoutMs Timeout duration in milliseconds (defaults to 6000)
 */
export async function fetchPincodeDetails(
  pincode: string,
  timeoutMs: number = 6000
): Promise<PostOfficeDetail[]> {
  // Enforce 6-digit numeric check
  if (!/^\d{6}$/.test(pincode)) {
    throw new Error('PIN code must be exactly 6 digits.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: PincodeApiResponse[] = await response.json();

    if (!data || data.length === 0) {
      throw new Error('No data received from postal API.');
    }

    const result = data[0];
    if (result.Status === 'Success' && result.PostOffice && result.PostOffice.length > 0) {
      return result.PostOffice;
    } else {
      throw new Error(result.Message || 'Failed to locate post offices for this PIN code.');
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Pincode request timed out. Please enter details manually.');
    }
    throw error;
  }
}
