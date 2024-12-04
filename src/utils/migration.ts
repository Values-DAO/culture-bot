import { TrustPools } from '../models/trustpool';
import { CultureBook } from '../models/culturebook';
import { connectDB } from '../services/database';

const migrate = async () => {
  await connectDB()
  
  const trustpools = await TrustPools.find({})
  
  for (const trustpool of trustpools) {
    const cultureBook = await CultureBook.create({
      trustPool: trustpool._id,
      core_values: {},
      spectrum: [],
      value_aligned_posts: [],
      top_posters: [],
      updateDescription: { content: "Initial culture book creation" },
    });
    trustpool.cultureBook = cultureBook._id;
    await trustpool.save()
  }
  
  process.exit(0)
}

migrate()