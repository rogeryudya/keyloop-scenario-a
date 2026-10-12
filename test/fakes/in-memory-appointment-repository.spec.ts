import { appointmentRepositoryContract } from '../contracts/appointment-repository.contract';
import { InMemoryAppointmentRepository } from './in-memory-appointment-repository';

describe('InMemoryAppointmentRepository', () => {
  appointmentRepositoryContract(() => Promise.resolve(new InMemoryAppointmentRepository()));
});
