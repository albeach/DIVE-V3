/**
 * XMP Metadata Service Tests
 *
 * Tests for XMP embedding and sidecar creation
 * for STANAG 4774/4778 compliance.
 */

import {
  createXMPPacket,
  createXMPSidecar,
  parseXMPSidecar,
  getXMPSidecarFilename,
  requiresXMPSidecar,
} from '../../services/xmp-metadata.service';

// Mock exiftool-vendored
jest.mock('exiftool-vendored', () => ({
  exiftool: {
    read: jest.fn().mockResolvedValue({
      Classification: 'SECRET',
      PolicyIdentifier: '1.3.26.1.3.1',
      Title: 'Test Document',
      Creator: 'test.user@example.com',
      CreateDate: new Date('2024-01-15'),
    }),
    write: jest.fn().mockResolvedValue({}),
    end: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock fs
jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue(Buffer.from('modified content')),
  unlinkSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
}));

describe('XMPMetadataService', () => {
  describe('createXMPPacket', () => {
    it('should create valid XMP packet with STANAG 4774 label', () => {
      const label = {
        policyIdentifier: '1.3.26.1.3.1',
        classification: 'SECRET',
        categories: [
          {
            tagSetId: '1.3.26.1.4.2',
            tagName: 'Releasable To',
            values: ['USA', 'GBR'],
          },
        ],
        creationDateTime: '2024-01-15T10:00:00Z',
      };

      const packet = createXMPPacket(label, 'Test Title', 'test.user');

      // Check XMP structure
      expect(packet).toContain('<?xpacket begin=""');
      expect(packet).toContain('<?xpacket end="w"?>');
      expect(packet).toContain('<x:xmpmeta');
      expect(packet).toContain('<rdf:RDF');

      // Check STANAG 4774 elements
      expect(packet).toContain('s4774:OriginatorConfidentialityLabel');
      expect(packet).toContain('s4774:PolicyIdentifier');
      expect(packet).toContain('1.3.26.1.3.1');
      expect(packet).toContain('s4774:Classification');
      expect(packet).toContain('SECRET');

      // Check category
      expect(packet).toContain('s4774:Category');
      expect(packet).toContain('Releasable To');
      expect(packet).toContain('USA');
      expect(packet).toContain('GBR');

      // Check Dublin Core elements
      expect(packet).toContain('dc:title');
      expect(packet).toContain('Test Title');
      expect(packet).toContain('dc:creator');
      expect(packet).toContain('test.user');
    });

    it('should create packet without optional fields', () => {
      const label = {
        policyIdentifier: '1.3.26.1.3.1',
        classification: 'CONFIDENTIAL',
      };

      const packet = createXMPPacket(label);

      expect(packet).toContain('<?xpacket begin=""');
      expect(packet).toContain('CONFIDENTIAL');
      expect(packet).not.toContain('s4774:Category');
    });

    it('should escape XML special characters', () => {
      const label = {
        policyIdentifier: '1.3.26.1.3.1',
        classification: 'SECRET',
      };

      const packet = createXMPPacket(label, 'Title with <special> & "chars"');

      expect(packet).toContain('&lt;special&gt;');
      expect(packet).toContain('&amp;');
      expect(packet).toContain('&quot;');
    });
  });

  describe('createXMPSidecar', () => {
    it('should create XMP sidecar with binding information', () => {
      const label = {
        policyIdentifier: '1.3.26.1.3.1',
        classification: 'SECRET',
      };

      const sidecar = createXMPSidecar('test.mp3', label, {
        title: 'Audio File',
        creator: 'test.user',
        mimeType: 'audio/mpeg',
      });

      // Check XMP structure
      expect(sidecar).toContain('<?xpacket begin=""');
      expect(sidecar).toContain('<?xpacket end="w"?>');

      // Check STANAG 4778 binding
      expect(sidecar).toContain('s4778:BindingInformation');
      expect(sidecar).toContain('s4778:DataReference');
      expect(sidecar).toContain('test.mp3');
      expect(sidecar).toContain('audio/mpeg');

      // Check STANAG 4774 label
      expect(sidecar).toContain('SECRET');
    });

    it('should handle filename with special characters', () => {
      const label = {
        policyIdentifier: '1.3.26.1.3.1',
        classification: 'UNCLASSIFIED',
      };

      const sidecar = createXMPSidecar("file's name & more.wav", label);

      expect(sidecar).toContain('&apos;');
      expect(sidecar).toContain('&amp;');
    });
  });

  describe('parseXMPSidecar', () => {
    it('should parse XMP sidecar and extract BDO', () => {
      const xmpContent = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description xmlns:s4774="urn:nato:stanag:4774:confidentialitymetadatalabel:1:0">
      <s4774:OriginatorConfidentialityLabel>
        <s4774:PolicyIdentifier>1.3.26.1.3.1</s4774:PolicyIdentifier>
        <s4774:Classification>SECRET</s4774:Classification>
        <s4774:CreationDateTime>2024-01-15T10:00:00Z</s4774:CreationDateTime>
        <s4774:Category s4774:tagSetId="1.3.26.1.4.2">
          <s4774:TagName>Releasable To</s4774:TagName>
          <s4774:Value>USA</s4774:Value>
          <s4774:Value>GBR</s4774:Value>
        </s4774:Category>
      </s4774:OriginatorConfidentialityLabel>
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Test Document</rdf:li></rdf:Alt></dc:title>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

      const bdo = parseXMPSidecar(xmpContent);

      expect(bdo).not.toBeNull();
      expect(bdo!.originatorConfidentialityLabel.classification).toBe('SECRET');
      expect(bdo!.originatorConfidentialityLabel.policyIdentifier).toBe('1.3.26.1.3.1');
      expect(bdo!.originatorConfidentialityLabel.categories).toHaveLength(1);
      expect(bdo!.originatorConfidentialityLabel.categories![0].values).toContain('USA');
      expect(bdo!.originatorConfidentialityLabel.categories![0].values).toContain('GBR');
      expect(bdo!.title).toBe('Test Document');
    });

    it('should return null for invalid XMP', () => {
      const bdo = parseXMPSidecar('not valid xml');
      expect(bdo).toBeNull();
    });

    it('should return null for XMP without classification', () => {
      const xmpContent = `<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF/></x:xmpmeta><?xpacket end="w"?>`;
      const bdo = parseXMPSidecar(xmpContent);
      expect(bdo).toBeNull();
    });
  });

  describe('getXMPSidecarFilename', () => {
    it('should append .xmp to filename', () => {
      expect(getXMPSidecarFilename('audio.mp3')).toBe('audio.mp3.xmp');
      expect(getXMPSidecarFilename('video.webm')).toBe('video.webm.xmp');
      expect(getXMPSidecarFilename('document.pdf')).toBe('document.pdf.xmp');
    });
  });

  describe('requiresXMPSidecar', () => {
    it('should return true for MP3', () => {
      expect(requiresXMPSidecar('audio/mpeg')).toBe(true);
    });

    it('should return true for WAV', () => {
      expect(requiresXMPSidecar('audio/wav')).toBe(true);
    });

    it('should return true for WebM', () => {
      expect(requiresXMPSidecar('video/webm')).toBe(true);
      expect(requiresXMPSidecar('audio/webm')).toBe(true);
    });

    it('should return true for OGG', () => {
      expect(requiresXMPSidecar('audio/ogg')).toBe(true);
      expect(requiresXMPSidecar('video/ogg')).toBe(true);
    });

    it('should return false for MP4', () => {
      expect(requiresXMPSidecar('video/mp4')).toBe(false);
    });

    it('should return false for M4A', () => {
      expect(requiresXMPSidecar('audio/mp4')).toBe(false);
    });
  });
});
