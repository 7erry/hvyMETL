import csv
import json
import random
import time
from datetime import datetime, timedelta

# Scale Configurations to guarantee "1000s of records" across all dimensions
NUM_AUTHORS = 400              # 400 CMS users
NUM_PAGES = 3000               # 3,000 total hierarchical pages
NUM_ASSETS = 5000              # 5,000 shared media uploads
NUM_TAGS = 2000                # Safely scaled to thousands without hanging!

def generate_cms_dataset():
    start_perf_time = time.time()
    print(f"Starting scaled CMS generation for {NUM_PAGES:,} pages...")

    # Shared pools for dynamic procedural generation
    first_names = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "William", "Elizabeth"]
    last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"]
    roles = ["admin", "editor", "author", "contributor"]
    statuses = ["published", "published", "published", "draft", "scheduled", "archived"]
    
    tag_topics = ["Tech", "Business", "Health", "Lifestyle", "Finance", "Travel", "Education", "Science", "AI", "Cloud", "Design", "DevOps"]
    tag_modifiers = ["Trends", "Insights", "101", "Advanced", "Strategy", "Tutorial", "Guide", "News", "Updates"]
    
    lorem_paragraphs = [
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
        "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
        "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
        "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
        "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam."
    ]

    # -------------------------------------------------------------------------
    # 1. Generate Authors
    # -------------------------------------------------------------------------
    print("Writing authors.csv...")
    author_ids = list(range(1, NUM_AUTHORS + 1))
    with open('authors.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'display_name', 'email', 'role'])
        
        for a_id in author_ids:
            name = f"{random.choice(first_names)} {random.choice(last_names)}"
            email = f"{name.lower().replace(' ', '.')}@cms-portal.internal"
            role = random.choice(roles) if a_id > 10 else "admin"
            writer.writerow([a_id, name, email, role])

    # -------------------------------------------------------------------------
    # 2. Generate Tags (Fixed: Infinite Loop Defeated)
    # -------------------------------------------------------------------------
    print("Writing tags.csv...")
    tag_ids = list(range(1, NUM_TAGS + 1))
    seen_tags = set()
    
    with open('tags.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'name', 'slug'])
        
        for t_id in tag_ids:
            tag_name = f"{random.choice(tag_topics)} {random.choice(tag_modifiers)}"
            tag_slug = tag_name.lower().replace(" ", "-")
            
            # Foolproof: If a duplicate combo occurs, append the ID to break collisions instantly
            if tag_slug in seen_tags:
                tag_name = f"{tag_name} {t_id}"
                tag_slug = f"{tag_slug}-{t_id}"
                
            seen_tags.add(tag_slug)
            writer.writerow([t_id, tag_name, tag_slug])

    # -------------------------------------------------------------------------
    # 3. Generate Assets
    # -------------------------------------------------------------------------
    print("Writing assets.csv...")
    image_asset_ids = []
    video_asset_ids = []
    
    with open('assets.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'file_name', 'mime_type', 'byte_size', 'storage_url', 'uploaded_at'])
        
        for asset_id in range(1, NUM_ASSETS + 1):
            is_image = random.random() > 0.25
            uploaded_at = (datetime.now() - timedelta(days=random.randint(30, 365))).strftime("%Y-%m-%d %H:%M:%S")
            byte_size = random.randint(10240, 25165824)
            
            if is_image:
                file_name = f"hero_banner_{asset_id}.jpg"
                mime_type = "image/jpeg"
                storage_url = f"https://cdn.cms-assets.internal/uploads/images/{file_name}"
                image_asset_ids.append(asset_id)
            else:
                file_name = f"product_explainer_{asset_id}.mp4"
                mime_type = "video/mp4"
                storage_url = f"https://cdn.cms-assets.internal/uploads/videos/{file_name}"
                video_asset_ids.append(asset_id)
                
            writer.writerow([asset_id, file_name, mime_type, byte_size, storage_url, uploaded_at])

    # -------------------------------------------------------------------------
    # 4. Generate Pages
    # -------------------------------------------------------------------------
    print("Writing pages.csv (Building hierarchy tree)...")
    pages_meta = []
    
    num_roots = int(NUM_PAGES * 0.05)
    num_sections = int(NUM_PAGES * 0.15)
    
    with open('pages.csv', mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'parent_id', 'author_id', 'slug', 'title', 'status', 'published_at', 'created_at'])
        
        for p_id in range(1, NUM_PAGES + 1):
            author_id = random.choice(author_ids)
            status = random.choice(statuses)
            created_dt = datetime.now() - timedelta(days=random.randint(15, 300))
            created_at_str = created_dt.strftime("%Y-%m-%d %H:%M:%S")
            
            if p_id <= num_roots:
                parent_id = ""
                title = f"Top Level Section {p_id}"
                slug = f"root-node-{p_id}"
            elif p_id <= (num_roots + num_sections):
                parent_id = random.randint(1, num_roots)
                title = f"Category Sub Hub {p_id}"
                slug = f"hub-section-{p_id}"
            else:
                parent_id = random.randint(num_roots + 1, num_roots + num_sections)
                title = f"Article Content Leaf Posting {p_id}"
                slug = f"content-story-node-{p_id}"
                
            published_at_str = ""
            if status == "published":
                pub_dt = created_dt + timedelta(hours=random.randint(1, 48))
                published_at_str = pub_dt.strftime("%Y-%m-%d %H:%M:%S")
            elif status == "scheduled":
                pub_dt = datetime.now() + timedelta(days=random.randint(2, 10))
                published_at_str = pub_dt.strftime("%Y-%m-%d %H:%M:%S")
                
            writer.writerow([p_id, parent_id, author_id, slug, title, status, published_at_str, created_at_str])
            
            pages_meta.append({
                "id": p_id,
                "created_at": created_dt,
                "title": title,
                "slug": slug
            })

    # -------------------------------------------------------------------------
    # 5. Stream Content Blocks, Revisions, and Tag Joins
    # -------------------------------------------------------------------------
    print("Streaming dependent rows (content_blocks, page_revisions, page_tags)...")
    
    block_id_counter = 1
    revision_id_counter = 1
    page_tag_id_counter = 1
    
    block_types = ["text", "image", "video", "embed"]
    embed_providers = ["https://www.youtube.com/embed/dQw4w9WgXcQ", "https://player.vimeo.com/video/76979870", "https://slideshare.net/embed/123"]
    change_summaries = ["Initial draft layout", "Fixed typographical errors", "Updated embedded links and headers", "Polished SEO metadata config", "Added rich media illustrations"]

    with open('content_blocks.csv', mode='w', newline='', encoding='utf-8') as f_blocks, \
         open('page_revisions.csv', mode='w', newline='', encoding='utf-8') as f_revisions, \
         open('page_tags.csv', mode='w', newline='', encoding='utf-8') as f_tags:
         
        block_writer = csv.writer(f_blocks)
        revision_writer = csv.writer(f_revisions)
        ptag_writer = csv.writer(f_tags)
        
        block_writer.writerow(['id', 'page_id', 'position', 'block_type', 'text_body', 'image_asset_id', 'image_alt', 'video_asset_id', 'video_duration_sec', 'embed_url'])
        revision_writer.writerow(['id', 'page_id', 'author_id', 'revision_number', 'change_summary', 'snapshot_json', 'created_at'])
        ptag_writer.writerow(['id', 'page_id', 'tag_id'])
        
        for p_meta in pages_meta:
            page_id = p_meta["id"]
            
            # Tags assignment
            assigned_tags = random.sample(tag_ids, k=random.randint(1, 4))
            for t_id in assigned_tags:
                ptag_writer.writerow([page_tag_id_counter, page_id, t_id])
                page_tag_id_counter += 1
                
            # Content Blocks placement
            num_blocks = random.randint(3, 7)
            current_page_blocks_snapshot = []
            
            for position in range(1, num_blocks + 1):
                b_type = random.choices(block_types, weights=[0.55, 0.25, 0.12, 0.08], k=1)[0]
                text_body, img_id, img_alt, vid_id, vid_dur, embed_url = "", "", "", "", "", ""
                
                if b_type == "text":
                    text_body = random.choice(lorem_paragraphs)
                elif b_type == "image":
                    img_id = random.choice(image_asset_ids)
                    img_alt = f"Descriptive typography placeholder text for asset {img_id}"
                elif b_type == "video":
                    vid_id = random.choice(video_asset_ids)
                    vid_dur = random.randint(15, 600)
                elif b_type == "embed":
                    embed_url = random.choice(embed_providers)
                    
                block_writer.writerow([block_id_counter, page_id, position, b_type, text_body, img_id, img_alt, vid_id, vid_dur, embed_url])
                
                current_page_blocks_snapshot.append({
                    "position": position,
                    "block_type": b_type,
                    "content_summary": text_body[:30] if b_type == "text" else (embed_url if b_type == "embed" else f"Asset Ref: {img_id or vid_id}")
                })
                block_id_counter += 1
                
            # Historical revisions
            num_revisions = random.randint(1, 4)
            for rev_num in range(1, num_revisions + 1):
                author_id = random.choice(author_ids)
                summary = change_summaries[0] if rev_num == 1 else random.choice(change_summaries[1:])
                rev_dt = p_meta["created_at"] + timedelta(days=(rev_num - 1) * random.uniform(0.5, 4))
                
                snapshot_data = {
                    "v_meta": {"schema_version": "1.4.2", "exported_by": author_id},
                    "page_properties": {"title": p_meta["title"], "slug": p_meta["slug"]},
                    "layout_blocks": current_page_blocks_snapshot
                }
                
                revision_writer.writerow([revision_id_counter, page_id, author_id, rev_num, summary, json.dumps(snapshot_data), rev_dt.strftime("%Y-%m-%d %H:%M:%S")])
                revision_id_counter += 1
                
            if page_id % 500 == 0:
                print(f"... flushed records up to Page ID {page_id:,} to disk")

    # -------------------------------------------------------------------------
    # Final Output Report
    # -------------------------------------------------------------------------
    end_perf_time = time.time()
    elapsed = end_perf_time - start_perf_time
    
    print("\n" + "="*50)
    print("CONTENT MANAGEMENT SYSTEM DATA GENERATION SUCCESSFUL")
    print("="*50)
    print(f"Total Execution Time: {elapsed:.2f} seconds")
    print(f" - authors.csv        : {NUM_AUTHORS:,} rows")
    print(f" - tags.csv           : {NUM_TAGS:,} rows (Safely Generated)")
    print(f" - assets.csv         : {NUM_ASSETS:,} rows")
    print(f" - pages.csv          : {NUM_PAGES:,} rows")
    print(f" - page_tags.csv      : {page_tag_id_counter - 1:,} rows")
    print(f" - content_blocks.csv : {block_id_counter - 1:,} rows")
    print(f" - page_revisions.csv : {revision_id_counter - 1:,} rows")
    print("="*50)

if __name__ == "__main__":
    generate_cms_dataset()
