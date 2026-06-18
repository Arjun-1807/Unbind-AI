#!/usr/bin/env python3
"""
Seed script to populate the lawyers collection with sample data.
"""

import asyncio
import os
import sys
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient

# Add the app directory to the path so we can import from it
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.config import get_settings

async def seed_lawyers():
    settings = get_settings()

    # Connect to MongoDB
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client.get_default_database(default="unbindai")

    # Sample lawyer data
    lawyers = [
        {
            "name": "Sarah Johnson",
            "specializations": ["Employment", "NDA"],
            "bio": "Sarah specializes in employment law with over 10 years of experience helping businesses navigate complex workplace issues. She has a particular focus on contract negotiation and employee relations.",
            "experienceYears": 10,
            "city": "San Francisco, CA",
            "email": "sarah.johnson@example.com",
            "phone": "+1 (415) 555-0123",
            "rating": 4.8,
            "verified": True,
            "createdAt": datetime.utcnow()
        },
        {
            "name": "Michael Chen",
            "specializations": ["Real Estate", "Corporate"],
            "bio": "Michael is a real estate attorney with extensive experience in commercial property transactions. He has helped clients with acquisitions, leasing, and development projects across the western United States.",
            "experienceYears": 8,
            "city": "New York, NY",
            "email": "michael.chen@example.com",
            "phone": "+1 (212) 555-0456",
            "rating": 4.9,
            "verified": True,
            "createdAt": datetime.utcnow()
        },
        {
            "name": "Elena Rodriguez",
            "specializations": ["SaaS", "Technology"],
            "bio": "Elena focuses on technology law, particularly for SaaS companies. She helps startups and established companies with licensing, data privacy, and intellectual property matters.",
            "experienceYears": 6,
            "city": "Austin, TX",
            "email": "elena.rodriguez@example.com",
            "phone": "+1 (512) 555-0789",
            "rating": 4.7,
            "verified": True,
            "createdAt": datetime.utcnow()
        },
        {
            "name": "David Kim",
            "specializations": ["NDA", "Corporate"],
            "bio": "David has extensive experience in corporate law, with a focus on mergers and acquisitions. He has helped numerous companies navigate complex transactions and contract negotiations.",
            "experienceYears": 12,
            "city": "Seattle, WA",
            "email": "david.kim@example.com",
            "phone": "+1 (206) 555-0321",
            "rating": 4.6,
            "verified": True,
            "createdAt": datetime.utcnow()
        },
        {
            "name": "Jennifer Williams",
            "specializations": ["Employment", "Compliance"],
            "bio": "Jennifer specializes in employment law and compliance, helping companies develop policies and procedures that meet regulatory requirements while protecting business interests.",
            "experienceYears": 9,
            "city": "Chicago, IL",
            "email": "jennifer.williams@example.com",
            "phone": "+1 (312) 555-0654",
            "rating": 4.8,
            "verified": True,
            "createdAt": datetime.utcnow()
        },
        {
            "name": "Robert Thompson",
            "specializations": ["Real Estate", "Construction"],
            "bio": "Robert focuses on real estate and construction law, representing developers, contractors, and property owners in complex transactions and dispute resolution.",
            "experienceYears": 15,
            "city": "Miami, FL",
            "email": "robert.thompson@example.com",
            "phone": "+1 (305) 555-0987",
            "rating": 4.9,
            "verified": True,
            "createdAt": datetime.utcnow()
        },
        {
            "name": "Amanda Patel",
            "specializations": ["SaaS", "Intellectual Property"],
            "bio": "Amanda helps technology companies protect their intellectual property and navigate licensing agreements. She has particular expertise in software licensing and open source compliance.",
            "experienceYears": 7,
            "city": "Boston, MA",
            "email": "amanda.patel@example.com",
            "phone": "+1 (617) 555-0147",
            "rating": 4.7,
            "verified": True,
            "createdAt": datetime.utcnow()
        },
        {
            "name": "James Wilson",
            "specializations": ["Corporate", "M&A"],
            "bio": "James has over 15 years of experience in corporate law, with a focus on mergers and acquisitions. He has advised on transactions ranging from small acquisitions to billion-dollar public offerings.",
            "experienceYears": 15,
            "city": "Washington, DC",
            "email": "james.wilson@example.com",
            "phone": "+1 (202) 555-0258",
            "rating": 4.8,
            "verified": True,
            "createdAt": datetime.utcnow()
        }
    ]

    # Clear existing lawyers (optional)
    await db.lawyers.delete_many({})

    # Insert new lawyers
    result = await db.lawyers.insert_many(lawyers)
    print(f"Inserted {len(result.inserted_ids)} lawyers into the database.")

    # Close connection
    client.close()
    print("Database connection closed.")

if __name__ == "__main__":
    asyncio.run(seed_lawyers())