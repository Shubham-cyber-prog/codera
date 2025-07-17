const express = require('express');
const axios = require('axios');
const AIInteraction = require('../models/AIInteraction');
const Problem = require('../models/Problem');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// OpenAI API configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

// Code review and analysis
router.post('/code-review', auth, async (req, res) => {
  try {
    const { code, language, problemId } = req.body;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ message: 'AI service not configured' });
    }

    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }

    const prompt = `
As a coding mentor, review this ${language} code for the problem "${problem.title}":

Problem Description: ${problem.description.replace(/<[^>]*>/g, '')}

Code:
\`\`\`${language}
${code}
\`\`\`

Please provide:
1. Code quality assessment (readability, structure, best practices)
2. Time and space complexity analysis
3. Potential bugs or edge cases missed
4. Suggestions for improvement
5. Alternative approaches if applicable

Keep the response concise but comprehensive.
    `;

    const response = await callOpenAI(prompt, 'code_review');

    // Save interaction
    const interaction = new AIInteraction({
      user: req.user.userId,
      type: 'code_review',
      context: {
        problem: problemId,
        code,
        language
      },
      query: 'Code review request',
      response: response.content,
      tokens_used: response.usage?.total_tokens || 0,
      response_time: response.response_time
    });

    await interaction.save();

    res.json({
      review: response.content,
      suggestions: extractSuggestions(response.content),
      complexity: extractComplexity(response.content)
    });

  } catch (error) {
    console.error('Code review error:', error);
    res.status(500).json({ message: 'Failed to analyze code' });
  }
});

// Get personalized learning roadmap
router.post('/roadmap', auth, async (req, res) => {
  try {
    const { goals, currentLevel, timeCommitment, preferredTopics } = req.body;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ message: 'AI service not configured' });
    }

    const user = await User.findById(req.user.userId);
    
    const prompt = `
Create a personalized coding learning roadmap for a ${currentLevel} level programmer.

User Profile:
- Current Level: ${currentLevel}
- Goals: ${goals.join(', ')}
- Time Commitment: ${timeCommitment} hours per week
- Preferred Topics: ${preferredTopics.join(', ')}
- Problems Solved: ${user.stats.totalSolved}
- Current Rating: ${user.stats.rating}

Please provide:
1. A structured learning path with milestones
2. Recommended topics and concepts to study
3. Practice problem categories and difficulty progression
4. Estimated timeline for each phase
5. Resources and tips for effective learning

Format as a detailed roadmap with clear phases and actionable steps.
    `;

    const response = await callOpenAI(prompt, 'roadmap');

    const interaction = new AIInteraction({
      user: req.user.userId,
      type: 'roadmap',
      context: {
        userLevel: currentLevel,
        goals
      },
      query: 'Personalized roadmap request',
      response: response.content,
      tokens_used: response.usage?.total_tokens || 0,
      response_time: response.response_time
    });

    await interaction.save();

    res.json({
      roadmap: response.content,
      phases: extractRoadmapPhases(response.content),
      estimatedDuration: extractDuration(response.content)
    });

  } catch (error) {
    console.error('Roadmap generation error:', error);
    res.status(500).json({ message: 'Failed to generate roadmap' });
  }
});

// Get hint for problem
router.post('/hint', auth, async (req, res) => {
  try {
    const { problemId, currentCode, language } = req.body;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ message: 'AI service not configured' });
    }

    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }

    const prompt = `
Provide a helpful hint for solving this coding problem. Don't give away the complete solution, but guide the user in the right direction.

Problem: ${problem.title}
Description: ${problem.description.replace(/<[^>]*>/g, '')}
Difficulty: ${problem.difficulty}

${currentCode ? `Current attempt:\n\`\`\`${language}\n${currentCode}\n\`\`\`` : ''}

Provide:
1. A conceptual hint about the approach
2. Key insights or patterns to recognize
3. Suggested next steps
4. Common pitfalls to avoid

Keep it encouraging and educational without spoiling the solution.
    `;

    const response = await callOpenAI(prompt, 'hint');

    const interaction = new AIInteraction({
      user: req.user.userId,
      type: 'hint',
      context: {
        problem: problemId,
        code: currentCode,
        language
      },
      query: 'Hint request',
      response: response.content,
      tokens_used: response.usage?.total_tokens || 0,
      response_time: response.response_time
    });

    await interaction.save();

    res.json({
      hint: response.content,
      approach: extractApproach(response.content)
    });

  } catch (error) {
    console.error('Hint generation error:', error);
    res.status(500).json({ message: 'Failed to generate hint' });
  }
});

// Debug help
router.post('/debug', auth, async (req, res) => {
  try {
    const { code, language, error, problemId } = req.body;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ message: 'AI service not configured' });
    }

    const problem = await Problem.findById(problemId);

    const prompt = `
Help debug this ${language} code that's encountering an error.

${problem ? `Problem: ${problem.title}` : ''}
${problem ? `Description: ${problem.description.replace(/<[^>]*>/g, '')}` : ''}

Code:
\`\`\`${language}
${code}
\`\`\`

Error: ${error}

Please provide:
1. Explanation of what's causing the error
2. Step-by-step debugging approach
3. Specific fixes needed
4. Prevention tips for similar issues

Be clear and educational in your explanation.
    `;

    const response = await callOpenAI(prompt, 'debug_help');

    const interaction = new AIInteraction({
      user: req.user.userId,
      type: 'debug_help',
      context: {
        problem: problemId,
        code,
        language,
        error
      },
      query: 'Debug help request',
      response: response.content,
      tokens_used: response.usage?.total_tokens || 0,
      response_time: response.response_time
    });

    await interaction.save();

    res.json({
      explanation: response.content,
      fixes: extractFixes(response.content)
    });

  } catch (error) {
    console.error('Debug help error:', error);
    res.status(500).json({ message: 'Failed to provide debug help' });
  }
});

// Get AI interaction history
router.get('/history', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    
    const query = { user: req.user.userId };
    if (type) query.type = type;

    const interactions = await AIInteraction.find(query)
      .populate('context.problem', 'title difficulty')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await AIInteraction.countDocuments(query);

    res.json({
      interactions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get AI history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Provide feedback on AI response
router.post('/feedback/:interactionId', auth, async (req, res) => {
  try {
    const { helpful, rating, comment } = req.body;
    
    const interaction = await AIInteraction.findById(req.params.interactionId);
    if (!interaction) {
      return res.status(404).json({ message: 'Interaction not found' });
    }

    if (interaction.user.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    interaction.feedback = {
      helpful,
      rating,
      comment
    };

    await interaction.save();

    res.json({ message: 'Feedback saved successfully' });
  } catch (error) {
    console.error('Save feedback error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to call OpenAI API
async function callOpenAI(prompt, type) {
  const startTime = Date.now();
  
  try {
    const response = await axios.post(
      `${OPENAI_BASE_URL}/chat/completions`,
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an expert coding mentor and teacher. Provide helpful, educational, and encouraging responses.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const endTime = Date.now();
    
    return {
      content: response.data.choices[0].message.content,
      usage: response.data.usage,
      response_time: endTime - startTime
    };
  } catch (error) {
    console.error('OpenAI API error:', error.response?.data || error.message);
    throw new Error('Failed to get AI response');
  }
}

// Helper functions to extract structured data from AI responses
function extractSuggestions(content) {
  const suggestions = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.includes('suggestion') || line.includes('improve') || line.includes('consider')) {
      suggestions.push(line.trim());
    }
  }
  
  return suggestions.slice(0, 5); // Limit to 5 suggestions
}

function extractComplexity(content) {
  const complexity = {};
  
  if (content.includes('O(')) {
    const timeMatch = content.match(/time.*?O\([^)]+\)/i);
    const spaceMatch = content.match(/space.*?O\([^)]+\)/i);
    
    if (timeMatch) complexity.time = timeMatch[0];
    if (spaceMatch) complexity.space = spaceMatch[0];
  }
  
  return complexity;
}

function extractRoadmapPhases(content) {
  const phases = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.match(/^\d+\./) || line.includes('Phase') || line.includes('Week')) {
      phases.push(line.trim());
    }
  }
  
  return phases.slice(0, 10); // Limit to 10 phases
}

function extractDuration(content) {
  const durationMatch = content.match(/(\d+)\s*(week|month|day)s?/i);
  return durationMatch ? durationMatch[0] : 'Variable';
}

function extractApproach(content) {
  const approaches = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.includes('approach') || line.includes('strategy') || line.includes('method')) {
      approaches.push(line.trim());
    }
  }
  
  return approaches.slice(0, 3);
}

function extractFixes(content) {
  const fixes = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.includes('fix') || line.includes('change') || line.includes('replace')) {
      fixes.push(line.trim());
    }
  }
  
  return fixes.slice(0, 5);
}

module.exports = router;