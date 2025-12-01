import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import {
  listBranchesController,
  createBranchController,
  updateBranchController,
  listBranchMembersController,
  addBranchMemberController,
  updateBranchMemberController,
  deleteBranchMemberController,
} from '../controllers/branches.controller';

const branchesRoutes = async (fastify: FastifyInstance) => {
  fastify.register(async (instance) => {
    instance.addHook('preHandler', authorize());

    instance.get('/branches', listBranchesController);
    instance.post('/branches', createBranchController);
    instance.patch('/branches/:id', updateBranchController);

    instance.get('/branch-members', listBranchMembersController);
    instance.post('/branch-members', addBranchMemberController);
    instance.patch('/branch-members/:id', updateBranchMemberController);
    instance.delete('/branch-members/:id', deleteBranchMemberController);
  });
};

export default branchesRoutes;


