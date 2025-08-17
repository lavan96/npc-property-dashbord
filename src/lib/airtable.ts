import { AirtableRecord, AirtableResponse, PropertyListing } from '@/types/airtable';

const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID || 'NPC_Ingest';
const AIRTABLE_TABLE_NAME = import.meta.env.VITE_AIRTABLE_TABLE_NAME || 'Ingested_Content';
const AIRTABLE_TOKEN = import.meta.env.VITE_AIRTABLE_TOKEN;

export class AirtableService {
  private baseUrl: string;
  private headers: HeadersInit;

  constructor() {
    this.baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;
    this.headers = {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    };
  }

  async getRecords(options: {
    pageSize?: number;
    offset?: string;
    sort?: { field: string; direction: 'asc' | 'desc' }[];
    filterByFormula?: string;
  } = {}): Promise<AirtableResponse> {
    const params = new URLSearchParams();
    
    if (options.pageSize) {
      params.append('pageSize', options.pageSize.toString());
    }
    
    if (options.offset) {
      params.append('offset', options.offset);
    }
    
    if (options.sort) {
      options.sort.forEach((sort, index) => {
        params.append(`sort[${index}][field]`, sort.field);
        params.append(`sort[${index}][direction]`, sort.direction);
      });
    }
    
    if (options.filterByFormula) {
      params.append('filterByFormula', options.filterByFormula);
    }

    const url = `${this.baseUrl}?${params.toString()}`;
    
    try {
      const response = await fetch(url, { headers: this.headers });
      
      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch Airtable records:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getRecords({ pageSize: 1 });
      return true;
    } catch (error) {
      return false;
    }
  }

  transformRecord(record: AirtableRecord): PropertyListing {
    const fields = record.fields;
    
    return {
      id: record.id,
      recordId: fields['Record ID'],
      url: fields['URL'],
      sourceHost: fields['Source Host'],
      hash: fields['Hash'],
      messageId: fields['MessageID'],
      emailSubject: fields['Email Subject'],
      from: fields['From'],
      receivedAt: fields['ReceivedAt'] ? new Date(fields['ReceivedAt']) : undefined,
      address: fields['Address'],
      suburb: fields['Suburb'],
      propertyType: fields['Property Type'],
      category: fields['Category'],
      price: fields['Price'],
      beds: fields['Beds'],
      baths: fields['Baths'],
      carSpaces: fields['Car Spaces'],
      inspectionStart: fields['Inspection Start'] ? new Date(fields['Inspection Start']) : undefined,
      inspectionEnd: fields['Inspection End'] ? new Date(fields['Inspection End']) : undefined,
      inspectionNotes: fields['Inspection Notes'],
      agencyName: fields['Agency Name'],
      agentName: fields['Agent Name'],
      agentPhone: fields['Agent Phone'],
      images: fields['Images'],
      floorplans: fields['Floorplans'],
      summary: fields['Summary'],
      keyEntities: fields['Key Entities'],
      confidence: fields['Confidence'],
      rawExtract: fields['Raw Extract'],
      createdTime: new Date(record.createdTime),
    };
  }
}

export const airtableService = new AirtableService();