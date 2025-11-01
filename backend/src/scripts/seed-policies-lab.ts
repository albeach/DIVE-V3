/**
 * Seed Policies Lab with Sample Policies
 * 
 * Creates example Rego and XACML policies for users to explore in Policy Lab
 * Policies are owned by "system" user and serve as learning examples
 * 
 * Run: npx tsx src/scripts/seed-policies-lab.ts
 */

import { MongoClient } from 'mongodb';
import crypto from 'crypto';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://admin:password@localhost:27017';
const DB_NAME = 'dive-v3';
const COLLECTION_NAME = 'policy_uploads';

// Sample Rego Policies
const SAMPLE_REGO_POLICIES = [
    {
        name: 'Simple Clearance Check',
        filename: 'simple_clearance_check.rego',
        description: 'Basic policy that checks if user clearance >= resource classification',
        content: `package dive.examples.simple_clearance

import rego.v1

# Clearance levels (lowest to highest)
clearance_levels := {
    "UNCLASSIFIED": 0,
    "CONFIDENTIAL": 1,
    "SECRET": 2,
    "TOP_SECRET": 3
}

# Default deny
default allow := false

# Allow if user clearance >= resource classification
allow if {
    input.subject.clearance
    input.resource.classification
    clearance_levels[input.subject.clearance] >= clearance_levels[input.resource.classification]
}

# Reason for decision
reason := "User clearance sufficient" if allow
reason := sprintf("User clearance %v insufficient for %v", [input.subject.clearance, input.resource.classification]) if not allow
`
    },
    {
        name: 'Country Releasability Policy',
        filename: 'country_releasability.rego',
        description: 'Checks if user country is in resource releasabilityTo list',
        content: `package dive.examples.country_check

import rego.v1

default allow := false

# Allow if user's country is in releasabilityTo
allow if {
    input.subject.countryOfAffiliation
    input.resource.releasabilityTo
    input.subject.countryOfAffiliation in input.resource.releasabilityTo
}

# Provide detailed reason
reason := sprintf("Access granted: %v in releasabilityTo %v", [
    input.subject.countryOfAffiliation,
    input.resource.releasabilityTo
]) if allow

reason := sprintf("Access denied: %v not in releasabilityTo %v", [
    input.subject.countryOfAffiliation,
    input.resource.releasabilityTo
]) if not allow
`
    },
    {
        name: 'Time-Based Embargo Policy',
        filename: 'time_embargo.rego',
        description: 'Enforces time-based embargoes on document release',
        content: `package dive.examples.time_embargo

import rego.v1

default allow := false

# Allow if current time is after embargo date
allow if {
    input.resource.embargoUntil
    input.context.currentTime
    time.parse_rfc3339_ns(input.context.currentTime) > time.parse_rfc3339_ns(input.resource.embargoUntil)
}

# Also allow if no embargo set
allow if {
    not input.resource.embargoUntil
}

reason := "Embargo period has passed - access granted" if {
    allow
    input.resource.embargoUntil
}

reason := "No embargo - access granted" if {
    allow
    not input.resource.embargoUntil
}

reason := sprintf("Embargo until %v - access denied", [input.resource.embargoUntil]) if not allow
`
    },
    {
        name: 'COI Membership Check',
        filename: 'coi_membership.rego',
        description: 'Validates user has required Community of Interest memberships',
        content: `package dive.examples.coi_check

import rego.v1

default allow := false

# Allow if user has ALL required COIs (AND logic)
allow if {
    input.resource.COI
    input.subject.acpCOI
    count(input.resource.COI) > 0
    required_cois := {coi | coi := input.resource.COI[_]}
    user_cois := {coi | coi := input.subject.acpCOI[_]}
    required_cois & user_cois == required_cois
}

# Allow if resource has no COI requirements
allow if {
    not input.resource.COI
}

allow if {
    input.resource.COI
    count(input.resource.COI) == 0
}

reason := "User has all required COIs" if {
    allow
    input.resource.COI
    count(input.resource.COI) > 0
}

reason := "No COI requirements" if {
    allow
    not input.resource.COI
}

reason := sprintf("User missing required COIs. Has: %v, Needs: %v", [
    input.subject.acpCOI,
    input.resource.COI
]) if not allow
`
    },
];

// Sample XACML Policy
const SAMPLE_XACML_POLICY = {
    name: 'XACML Clearance Policy',
    filename: 'xacml_clearance.xml',
    description: 'XACML 3.0 policy for clearance-based access control',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<Policy xmlns="urn:oasis:names:tc:xacml:3.0:core:schema:wd-17"
        PolicyId="clearance-policy"
        Version="1.0"
        RuleCombiningAlgId="urn:oasis:names:tc:xacml:3.0:rule-combining-algorithm:deny-unless-permit">
    
    <Description>Simple clearance-based access control policy</Description>
    
    <Target>
        <AnyOf>
            <AllOf>
                <Match MatchId="urn:oasis:names:tc:xacml:1.0:function:string-equal">
                    <AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">read</AttributeValue>
                    <AttributeDesignator
                        AttributeId="urn:oasis:names:tc:xacml:1.0:action:action-id"
                        Category="urn:oasis:names:tc:xacml:3.0:attribute-category:action"
                        DataType="http://www.w3.org/2001/XMLSchema#string"
                        MustBePresent="true"/>
                </Match>
            </AllOf>
        </AnyOf>
    </Target>
    
    <Rule RuleId="clearance-check" Effect="Permit">
        <Description>Permit if user clearance >= resource classification</Description>
        <Condition>
            <Apply FunctionId="urn:oasis:names:tc:xacml:1.0:function:integer-greater-than-or-equal">
                <Apply FunctionId="urn:oasis:names:tc:xacml:1.0:function:integer-one-and-only">
                    <AttributeDesignator
                        AttributeId="clearanceLevel"
                        Category="urn:oasis:names:tc:xacml:1.0:subject-category:access-subject"
                        DataType="http://www.w3.org/2001/XMLSchema#integer"
                        MustBePresent="true"/>
                </Apply>
                <Apply FunctionId="urn:oasis:names:tc:xacml:1.0:function:integer-one-and-only">
                    <AttributeDesignator
                        AttributeId="classificationLevel"
                        Category="urn:oasis:names:tc:xacml:3.0:attribute-category:resource"
                        DataType="http://www.w3.org/2001/XMLSchema#integer"
                        MustBePresent="true"/>
                </Apply>
            </Apply>
        </Condition>
    </Rule>
</Policy>`
};

/**
 * Create policy upload object
 */
function createPolicyUpload(
    name: string,
    filename: string,
    content: string,
    description: string,
    type: 'rego' | 'xacml',
    ownerId: string = 'system-examples'
) {
    const policyId = `example-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // Parse package name for Rego
    let packageName = 'unknown';
    if (type === 'rego') {
        const packageMatch = content.match(/package\s+([\w.]+)/);
        if (packageMatch) {
            packageName = packageMatch[1];
        }
    }

    return {
        policyId,
        ownerId,
        type,
        filename,
        content,
        hash,
        size: Buffer.byteLength(content, 'utf8'),
        validated: true,  // Pre-validated examples
        validationErrors: [],
        metadata: {
            name,
            description,
            packageOrPolicyId: type === 'rego' ? packageName : `policy:${policyId}`,
            uploadedAt: new Date().toISOString(),
            rules: type === 'rego' ? (content.match(/^[\w_]+\s*:?=/gm) || []).length : 1,
            // Note: These are simplified example policies, not full OPA tests
            tests: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

/**
 * Main seed function
 */
async function seedPoliciesLab() {
    console.log('🌱 Seeding Policies Lab with sample policies...\n');

    const client = new MongoClient(MONGODB_URL);

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        // Clear existing sample policies (owned by system-examples)
        const deleteResult = await collection.deleteMany({ ownerId: 'system-examples' });
        console.log(`🗑️  Deleted ${deleteResult.deletedCount} existing sample policies\n`);

        // Create sample policies
        const samplePolicies = [];

        // Add Rego samples
        for (const sample of SAMPLE_REGO_POLICIES) {
            const policy = createPolicyUpload(
                sample.name,
                sample.filename,
                sample.content,
                sample.description,
                'rego'
            );
            samplePolicies.push(policy);
            console.log(`📝 Created Rego policy: ${sample.name}`);
        }

        // Add XACML sample
        const xacmlPolicy = createPolicyUpload(
            SAMPLE_XACML_POLICY.name,
            SAMPLE_XACML_POLICY.filename,
            SAMPLE_XACML_POLICY.content,
            SAMPLE_XACML_POLICY.description,
            'xacml'
        );
        samplePolicies.push(xacmlPolicy);
        console.log(`📋 Created XACML policy: ${SAMPLE_XACML_POLICY.name}\n`);

        // Insert all policies
        const insertResult = await collection.insertMany(samplePolicies);
        console.log(`✅ Inserted ${insertResult.insertedCount} sample policies\n`);

        // Show summary
        console.log('📊 Sample Policies Created:');
        console.log('----------------------------');
        samplePolicies.forEach((p, i) => {
            console.log(`${i + 1}. ${p.metadata.name} (${p.type.toUpperCase()})`);
            console.log(`   Package: ${p.metadata.packageOrPolicyId}`);
            console.log(`   Description: ${p.metadata.description}`);
            console.log(`   Rules: ${p.metadata.rules}`);
            console.log('');
        });

        console.log('✅ Policies Lab seeded successfully!\n');
        console.log('🎯 Next Steps:');
        console.log('   1. Navigate to https://localhost:3000/policies/lab');
        console.log('   2. View the sample policies in the "My Policies" tab');
        console.log('   3. Click "Evaluate" to test them with custom inputs');
        console.log('   4. Upload your own policies to experiment\n');

    } catch (error) {
        console.error('❌ Error seeding Policies Lab:', error);
        process.exit(1);
    } finally {
        await client.close();
        console.log('✅ MongoDB connection closed');
    }
}

// Run if executed directly
if (require.main === module) {
    seedPoliciesLab()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

export { seedPoliciesLab };

